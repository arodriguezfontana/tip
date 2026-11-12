"""Servicio de análisis comercial avanzado, cálculo de KPIs estratégicos, metas y evaluación de rentabilidad."""

import collections
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, NamedTuple

from google import genai
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import transaction
from app.models.business_goal import BusinessGoal
from app.repositories import analytics_repository, ingredient_repository, order_repository
from app.services import stats_service
from app.services.gemini_models import modelos
from app.services.ingredient_service import consumption_totals

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BusinessGoalData:
    period_type: str
    target_revenue: float
    target_orders: int
    updated_at: datetime | None = None


@dataclass(frozen=True)
class GrowthMetric:
    current: float
    previous: float
    growth_pct: float | None
    trend: str  # 'up', 'down', 'neutral'
    is_positive: bool


@dataclass
class GoalProgress:
    period_type: str
    target_revenue: float
    revenue_progress_pct: float
    revenue_remaining: float
    target_orders: int
    orders_progress_pct: float
    orders_remaining: int


@dataclass(frozen=True)
class TopProductKpi:
    product_name: str
    total_quantity: int
    total_revenue: float
    estimated_cost: float
    gross_profit: float
    margin_pct: float
    quantity_growth_pct: float | None
    revenue_growth_pct: float | None


@dataclass(frozen=True)
class DashboardKpis:
    revenue: GrowthMetric
    orders_count: GrowthMetric
    completed_orders_count: int
    average_ticket: GrowthMetric
    cancellation_rate: GrowthMetric
    cogs: GrowthMetric
    gross_profit: GrowthMetric
    gross_margin_pct: float
    goal: GoalProgress | None
    best_selling_day: dict[str, Any]
    status_distribution: dict[str, int]
    top_products: list[TopProductKpi]


@dataclass(frozen=True)
class OperationalMetrics:
    avg_wait_minutes: float = 0.0
    max_wait_minutes: int = 0
    high_wait_count: int = 0
    high_wait_pct: float = 0.0
    peak_hour: int | None = None
    peak_hour_orders: int = 0
    delivery_pct: float = 0.0
    pickup_pct: float = 0.0


@dataclass(frozen=True)
class StrategicInsight:
    summary: str
    highlights: list[str]
    operational_weaknesses: list[str]
    recommendations: list[str]
    operational_metrics: OperationalMetrics
    generated_at: datetime
    # Puntos de atención y alertas: hoy son las mismas debilidades operativas.
    warnings: list[str] = field(default_factory=list)


# Un pedido con una demora estimada de estos minutos o más cuenta como de demora alta.
HIGH_WAIT_MINUTES = 45

DEFAULT_GOALS = [
    {"period_type": "monthly", "target_revenue": Decimal("5000000"), "target_orders": 300},
    {"period_type": "weekly", "target_revenue": Decimal("1250000"), "target_orders": 75},
    {"period_type": "daily", "target_revenue": Decimal("200000"), "target_orders": 15},
]


def get_previous_period(
    date_from: datetime | None, date_to: datetime | None
) -> tuple[datetime | None, datetime | None]:
    """Calcula el período anterior equivalente para comparativas de tendencia."""
    if date_from is None or date_to is None:
        return None, None
    duration = date_to - date_from
    prev_to = date_from
    prev_from = date_from - duration
    return prev_from, prev_to


def _growth_from_zero(current: float) -> tuple[float, str]:
    """Variación cuando el período anterior no tuvo nada: cualquier valor es un salto del 100%."""
    if current > 0.0:
        return 100.0, "up"
    if current < 0.0:
        return -100.0, "down"
    return 0.0, "neutral"


def _growth_pct_and_trend(current: float, previous: float) -> tuple[float, str]:
    if previous == 0.0:
        return _growth_from_zero(current)
    growth_pct = round(((current - previous) / abs(previous)) * 100.0, 1)
    if growth_pct > 0.1:
        return growth_pct, "up"
    if growth_pct < -0.1:
        return growth_pct, "down"
    return growth_pct, "neutral"


def calculate_growth_metric(
    current: float, previous: float, higher_is_better: bool = True
) -> GrowthMetric:
    """Calcula la variación porcentual entre el período actual y el anterior con dirección y semántica de negocio."""
    curr = float(current)
    prev = float(previous)
    growth_pct, trend = _growth_pct_and_trend(curr, prev)
    favorable_trend = "up" if higher_is_better else "down"
    return GrowthMetric(
        current=round(curr, 2),
        previous=round(prev, 2),
        growth_pct=growth_pct if (prev != 0.0 or curr != 0.0) else None,
        trend=trend,
        is_positive=trend in (favorable_trend, "neutral"),
    )


# --- Metas de Negocio ---------------------------------------------------------------------------------


def _list_goals_creating_defaults(db: Session) -> list[BusinessGoal]:
    """Las metas configuradas; si todavía no hay ninguna, crea las predeterminadas."""
    goals = analytics_repository.list_goals(db)
    if goals:
        return goals
    with transaction(db):
        for default in DEFAULT_GOALS:
            analytics_repository.add_goal(db, BusinessGoal(**default))
    return analytics_repository.list_goals(db)


def get_business_goals(db: Session) -> list[BusinessGoalData]:
    return [
        BusinessGoalData(
            period_type=g.period_type,
            target_revenue=float(g.target_revenue or 0),
            target_orders=g.target_orders or 0,
            updated_at=g.updated_at,
        )
        for g in _list_goals_creating_defaults(db)
    ]


def _save_goal(db: Session, item: BusinessGoalData) -> None:
    goal = analytics_repository.get_goal_by_period(db, item.period_type)
    if goal is None:
        goal = BusinessGoal(period_type=item.period_type)
        analytics_repository.add_goal(db, goal)
    goal.target_revenue = Decimal(str(item.target_revenue))
    goal.target_orders = item.target_orders


def update_business_goals(db: Session, goals: list[BusinessGoalData]) -> list[BusinessGoalData]:
    with transaction(db):
        for item in goals:
            _save_goal(db, item)
    return get_business_goals(db)


def _goal_period_key(date_from: datetime | None, date_to: datetime | None) -> str:
    """Tipo de meta ('daily', 'weekly' o 'monthly') que corresponde a la duración del período seleccionado."""
    if not date_from or not date_to:
        return "monthly"
    days = max(1.0, (date_to - date_from).total_seconds() / 86400.0)
    if days <= 1.5:
        return "daily"
    return "weekly" if days <= 8.5 else "monthly"


def _determine_target_goal(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> GoalProgress | None:
    """Determina la meta comercial que mejor se adapta al período seleccionado y calcula el progreso."""
    goals_by_type = {g.period_type: g for g in get_business_goals(db)}
    period_key = _goal_period_key(date_from, date_to)
    # Sin meta diaria o semanal, se usa la mensual.
    target = goals_by_type.get(period_key) or goals_by_type.get("monthly")
    if not target:
        return None

    return GoalProgress(
        period_type=period_key,
        target_revenue=target.target_revenue,
        revenue_progress_pct=0.0,
        revenue_remaining=target.target_revenue,
        target_orders=target.target_orders,
        orders_progress_pct=0.0,
        orders_remaining=target.target_orders,
    )


# --- Costos y flujo operativo -------------------------------------------------------------------------


def calculate_cogs(db: Session, date_from: datetime | None, date_to: datetime | None) -> float:
    """Costo aproximado de la mercadería vendida (COGS): el consumo real de ingredientes en pedidos completados por
    el costo unitario de cada ingrediente."""
    consumed = consumption_totals(db, date_from, date_to, ingredient_id=None)
    if not consumed:
        return 0.0
    ingredients = ingredient_repository.get_many(db, {ingredient_id for ingredient_id, _, _, _ in consumed})
    total = sum(quantity * float(ingredients[ingredient_id].cost or 0) for ingredient_id, _, _, quantity in consumed)
    return round(total, 2)


def get_products_unit_cost(db: Session, product_names: list[str]) -> dict[str, float]:
    """Costo unitario de preparación de cada producto según su receta actual e ingredientes."""
    if not product_names:
        return {}
    return {
        product.name: round(
            sum(
                float(item.quantity) * (float(item.ingredient.cost or 0) if item.ingredient else 0.0)
                for item in product.recipe_items
            ),
            2,
        )
        for product in analytics_repository.products_with_recipe(db, product_names)
    }


def _percentage(part: int, total: int) -> float:
    return round(part / total * 100.0, 1) if total > 0 else 0.0


def _peak_hour(orders: list) -> tuple[int | None, int]:
    """(hora del día con más pedidos, cantidad de pedidos en esa hora)."""
    by_hour = collections.Counter(order.created_at.hour for order in orders if order.created_at)
    return by_hour.most_common(1)[0] if by_hour else (None, 0)


def get_operational_flow_and_wait_times(db: Session, date_from: datetime | None, date_to: datetime | None) -> dict[str, Any]:
    """Métricas operativas de tiempos de espera y flujo de pedidos en el período."""
    orders = analytics_repository.order_summaries(db, date_from, date_to)
    total_orders = len(orders)
    wait_times = [o.estimated_minutes for o in orders if o.estimated_minutes is not None and o.estimated_minutes > 0]
    high_wait_count = sum(1 for wait in wait_times if wait >= HIGH_WAIT_MINUTES)
    peak_hour, peak_hour_orders = _peak_hour(orders)
    delivery_counts = collections.Counter(o.delivery_method for o in orders if o.delivery_method)
    delivery_count = delivery_counts.get("domicilio", 0)
    pickup_count = delivery_counts.get("retiro", 0)

    return {
        "total_orders": total_orders,
        "avg_wait_minutes": round(sum(wait_times) / len(wait_times), 1) if wait_times else 0.0,
        "max_wait_minutes": max(wait_times, default=0),
        "high_wait_count": high_wait_count,
        "high_wait_pct": _percentage(high_wait_count, len(wait_times)),
        "peak_hour": peak_hour,
        "peak_hour_orders": peak_hour_orders,
        "peak_hour_pct": _percentage(peak_hour_orders, total_orders),
        "delivery_count": delivery_count,
        "pickup_count": pickup_count,
        "delivery_pct": _percentage(delivery_count, total_orders),
        "pickup_pct": _percentage(pickup_count, total_orders),
        "sources": dict(collections.Counter(o.source for o in orders if o.source)),
    }


# --- Dashboard de KPIs y Rendimiento -------------------------------------------------------------------


def _average_ticket(revenue: float, completed_orders: int, billable_orders: int) -> float:
    """Total facturado sobre los pedidos finalizados (o los facturables si todavía no hay finalizados)."""
    divisor = completed_orders or billable_orders
    return revenue / divisor if divisor > 0 else 0.0


def _cancellation_rate(status_distribution: dict[str, int]) -> float:
    """Porcentaje de pedidos rechazados o cancelados sobre el total ingresado."""
    total_orders = sum(status_distribution.values())
    rejected_and_cancelled = status_distribution.get("Rechazado", 0) + status_distribution.get("Cancelado", 0)
    return rejected_and_cancelled / total_orders * 100.0 if total_orders > 0 else 0.0


def _with_goal_progress(goal: GoalProgress | None, revenue: float, orders: int) -> GoalProgress | None:
    """Completa en la meta cuánto se alcanzó de la facturación y de los pedidos."""
    if goal is None:
        return None
    if goal.target_revenue > 0:
        goal.revenue_progress_pct = round((revenue / goal.target_revenue) * 100.0, 1)
        goal.revenue_remaining = max(0.0, goal.target_revenue - revenue)
    if goal.target_orders > 0:
        goal.orders_progress_pct = round((orders / goal.target_orders) * 100.0, 1)
        goal.orders_remaining = max(0, goal.target_orders - orders)
    return goal


def _best_selling_day_summary(
    db: Session, date_from: datetime | None, date_to: datetime | None, previous_period: tuple | None
) -> dict:
    current_day = stats_service.best_selling_day(db, date_from, date_to)
    previous_day = stats_service.best_selling_day(db, *previous_period) if previous_period else None
    growth = calculate_growth_metric(
        current_day.total_revenue or 0.0,
        (previous_day.total_revenue or 0.0) if previous_day else 0.0,
    )
    return {
        "day": current_day.weekday,
        "revenue": current_day.total_revenue,
        "growth_pct": growth.growth_pct,
        "trend": growth.trend,
    }


def _top_product_kpi(
    name: str, quantity, revenue, unit_cost: float, previous: tuple[int, float] | None
) -> TopProductKpi:
    """KPIs de un producto; `previous` es (cantidad, facturación) del período anterior, o None si no se compara."""
    qty = int(quantity)
    rev = float(revenue)
    estimated_cost = round(qty * unit_cost, 2)
    gross_profit = round(max(0.0, rev - estimated_cost), 2)
    previous_qty, previous_rev = previous or (0, 0.0)
    return TopProductKpi(
        product_name=name,
        total_quantity=qty,
        total_revenue=rev,
        estimated_cost=estimated_cost,
        gross_profit=gross_profit,
        margin_pct=round((gross_profit / rev * 100.0), 1) if rev > 0 else 0.0,
        quantity_growth_pct=calculate_growth_metric(qty, previous_qty).growth_pct if previous else None,
        revenue_growth_pct=calculate_growth_metric(rev, previous_rev).growth_pct if previous else None,
    )


def _top_products_kpis(
    db: Session, date_from: datetime | None, date_to: datetime | None, previous_period: tuple | None
) -> list[TopProductKpi]:
    """Los productos más vendidos con su costo, margen y variación contra el período anterior."""
    top_products = order_repository.best_selling_products(db, date_from, date_to, limit=6)
    unit_costs = get_products_unit_cost(db, [name for name, _, _ in top_products])
    previous_sales: dict[str, tuple[int, float]] | None = None
    if previous_period:
        previous_top = order_repository.best_selling_products(db, *previous_period, limit=20)
        previous_sales = {name: (qty, rev) for name, qty, rev in previous_top}
    return [
        _top_product_kpi(
            name,
            qty,
            rev,
            unit_costs.get(name, 0.0),
            None if previous_sales is None else previous_sales.get(name, (0, 0.0)),
        )
        for name, qty, rev in top_products
    ]


def calculate_dashboard_kpis(
    db: Session, date_from: datetime | None = None, date_to: datetime | None = None
) -> DashboardKpis:
    """Calcula todas las métricas de rendimiento comercial, rentabilidad bruta, tendencias y metas."""
    prev_from, prev_to = get_previous_period(date_from, date_to)
    previous_period = (prev_from, prev_to) if prev_from and prev_to else None

    # Facturación y conteo de pedidos
    curr_rev, curr_billable_count = analytics_repository.billable_revenue_and_count(db, date_from, date_to)
    prev_rev, prev_billable_count = (
        analytics_repository.billable_revenue_and_count(db, *previous_period) if previous_period else (0.0, 0)
    )

    # Distribución de estados
    status_dist = analytics_repository.order_counts_by_status(db, date_from, date_to)
    prev_status_dist = analytics_repository.order_counts_by_status(db, *previous_period) if previous_period else {}
    completed_orders = status_dist.get("Finalizado", 0)
    prev_completed_orders = prev_status_dist.get("Finalizado", 0)

    # Costos y rentabilidad bruta (COGS y margen)
    curr_cogs = calculate_cogs(db, date_from, date_to)
    prev_cogs = calculate_cogs(db, *previous_period) if previous_period else 0.0
    curr_gross_profit = max(0.0, curr_rev - curr_cogs)
    prev_gross_profit = max(0.0, prev_rev - prev_cogs)

    # Metas y progreso
    goal_progress = _with_goal_progress(
        _determine_target_goal(db, date_from, date_to), curr_rev, completed_orders or curr_billable_count
    )

    return DashboardKpis(
        revenue=calculate_growth_metric(curr_rev, prev_rev),
        orders_count=calculate_growth_metric(curr_billable_count, prev_billable_count),
        completed_orders_count=completed_orders,
        average_ticket=calculate_growth_metric(
            _average_ticket(curr_rev, completed_orders, curr_billable_count),
            _average_ticket(prev_rev, prev_completed_orders, prev_billable_count),
        ),
        cancellation_rate=calculate_growth_metric(
            _cancellation_rate(status_dist), _cancellation_rate(prev_status_dist), higher_is_better=False
        ),
        cogs=calculate_growth_metric(curr_cogs, prev_cogs, higher_is_better=False),
        gross_profit=calculate_growth_metric(curr_gross_profit, prev_gross_profit),
        gross_margin_pct=round((curr_gross_profit / curr_rev * 100.0), 1) if curr_rev > 0 else 0.0,
        goal=goal_progress,
        best_selling_day=_best_selling_day_summary(db, date_from, date_to, previous_period),
        status_distribution=status_dist,
        top_products=_top_products_kpis(db, date_from, date_to, previous_period),
    )


# --- Asistente Inteligente de Análisis Comercial (LLM / BI) -------------------------------------------


class _InsightText(NamedTuple):
    summary: str
    highlights: list[str]
    weaknesses: list[str]
    recommendations: list[str]


def _estimated_operational_data(kpi_data: DashboardKpis) -> dict:
    """Métricas operativas aproximadas para cuando no hay una base de datos de la que sacarlas."""
    orders = kpi_data.orders_count.current
    return {
        "total_orders": orders,
        "avg_wait_minutes": 25.0,
        "max_wait_minutes": 40,
        "high_wait_count": 0,
        "high_wait_pct": 0.0,
        "peak_hour": 21,
        "peak_hour_orders": max(1, int(orders * 0.4)),
        "peak_hour_pct": 40.0,
        "delivery_count": int(orders * 0.7),
        "pickup_count": int(orders * 0.3),
        "delivery_pct": 70.0,
        "pickup_pct": 30.0,
        "sources": {"bot": orders},
    }


def _operational_context(op_data: dict) -> OperationalMetrics:
    return OperationalMetrics(
        avg_wait_minutes=float(op_data.get("avg_wait_minutes", 0.0)),
        max_wait_minutes=int(op_data.get("max_wait_minutes", 0)),
        high_wait_count=int(op_data.get("high_wait_count", 0)),
        high_wait_pct=float(op_data.get("high_wait_pct", 0.0)),
        peak_hour=op_data.get("peak_hour"),
        peak_hour_orders=int(op_data.get("peak_hour_orders", 0)),
        delivery_pct=float(op_data.get("delivery_pct", 0.0)),
        pickup_pct=float(op_data.get("pickup_pct", 0.0)),
    )


def _build_insight_prompt(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> str:
    if op_context.peak_hour is None:
        peak_str = "Sin concentración significativa"
    else:
        peak_str = f"{op_context.peak_hour:02d}:00 hs ({op_context.peak_hour_orders} pedidos, {peak_hour_pct}% del volumen)"
    star_products = ", ".join(
        f"{p.product_name} ({p.total_quantity}u, margen {p.margin_pct}%)" for p in kpi_data.top_products[:3]
    )
    goal_progress = kpi_data.goal.revenue_progress_pct if kpi_data.goal else "N/A"

    return f"""
Sos un consultor experto en optimización gastronómica y Business Intelligence para el dueño de un restaurante.
Analizá los siguientes datos y estadísticas reales del negocio correspondientes al período seleccionado:

MÉTRICAS DE VENTAS Y FINANZAS:
- Facturación total: ${kpi_data.revenue.current:,.2f} (Variación vs período anterior: {kpi_data.revenue.growth_pct or 0}%)
- Total pedidos ingresados: {kpi_data.orders_count.current} (Completados: {kpi_data.completed_orders_count})
- Ticket promedio: ${kpi_data.average_ticket.current:,.2f}
- Tasa de rechazo/cancelación: {kpi_data.cancellation_rate.current}%
- Margen bruto promedio: {kpi_data.gross_margin_pct}% (Ganancia bruta: ${kpi_data.gross_profit.current:,.2f}, Costo insumos COGS: ${kpi_data.cogs.current:,.2f})
- Cumplimiento de meta: {goal_progress}% de la meta de facturación.
- Platos estrella: {star_products or 'Sin ventas'}

TIEMPOS DE ESPERA Y OPERACIONES:
- Demora promedio estimada: {op_context.avg_wait_minutes} minutos
- Demora máxima registrada: {op_context.max_wait_minutes} minutos
- Pedidos con demoras altas (>= 45 min): {op_context.high_wait_count} ({op_context.high_wait_pct}%)

FLUJO DE PEDIDOS Y CANALES:
- Hora pico de mayor demanda: {peak_str}
- Modalidad de entrega: {op_context.delivery_pct}% Domicilio, {op_context.pickup_pct}% Retiro en local

REGLAS ESTRICTAS DE RESPUESTA:
1. CITÁ ÚNICAMENTE valores reales provistos en este contexto. NO inventes cifras, clientes ni datos no suministrados.
2. Identificá debilidades operativas concretas (ej: cuellos de botella en la hora pico, demoras excesivas, productos con bajo margen o cancelaciones).
3. Cada recomendación DEBE ser una acción concreta e inmediata que el local pueda ejecutar (ej: reorganizar puestos en cocina para la hora pico, ajustar el stock de ingredientes específicos, limitar pedidos si la demora supera 45 min). Prohibidos los consejos genéricos.

Respondé en español ÚNICAMENTE con un objeto JSON válido con este esquema exacto:
{{
  "summary": "Diagnóstico general conciso de 1 párrafo citando las métricas clave del negocio.",
  "operational_weaknesses": [
    "Debilidad operativa 1 explicando el problema con cifras reales del período",
    "Debilidad operativa 2..."
  ],
  "recommendations": [
    "Acción concreta 1 que el dueño puede implementar inmediatamente",
    "Acción concreta 2..."
  ],
  "highlights": [
    "Punto fuerte u oportunidad 1 con cifras reales"
  ]
}}
"""


def _without_code_fence(text: str) -> str:
    """El texto sin las comillas de bloque de código (```json ... ```) con las que el modelo suele envolver el JSON."""
    cleaned = text.strip()
    if not cleaned.startswith("```"):
        return cleaned
    cleaned = cleaned.split("```")[1]
    return cleaned.removeprefix("json").strip()


def _insight_from_model_answer(answer: str) -> _InsightText:
    parsed = json.loads(_without_code_fence(answer))
    return _InsightText(
        summary=parsed.get("summary") or "Rendimiento comercial y operativo evaluado correctamente.",
        highlights=parsed.get("highlights") or [],
        weaknesses=parsed.get("operational_weaknesses")
        or ["No se detectaron cuellos de botella críticos en las comandas del período."],
        recommendations=parsed.get("recommendations")
        or ["Revisar márgenes y tiempos en las horas de mayor demanda."],
    )


def _insight_from_gemini(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> _InsightText | None:
    """El análisis que redacta Gemini, o None si no se pudo obtener."""
    try:
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content(
            model=modelos.principal,
            contents=_build_insight_prompt(kpi_data, op_context, peak_hour_pct),
        )
        return _insight_from_model_answer(response.text or "")
    except Exception as e:
        logger.warning("Fallo al consultar Gemini para insights comerciales: %s", e)
        return None


def _rule_based_weaknesses(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> list[str]:
    margin = kpi_data.gross_margin_pct
    cancellation = kpi_data.cancellation_rate.current
    is_slow = op_context.avg_wait_minutes >= 35.0 or op_context.max_wait_minutes >= 50
    has_peak_bottleneck = op_context.peak_hour is not None and peak_hour_pct >= 30.0
    detected = [
        (
            is_slow,
            f"Demoras de preparación elevadas: promedio de {op_context.avg_wait_minutes} min (máximo de {op_context.max_wait_minutes} min), con {op_context.high_wait_count} pedidos superando los 45 minutos.",
        ),
        (
            has_peak_bottleneck,
            f"Cuello de botella en hora pico: el {peak_hour_pct}% de las comandas se concentró a las {op_context.peak_hour or 0:02d}:00 hs ({op_context.peak_hour_orders} pedidos), saturando la línea de despacho.",
        ),
        (
            cancellation > 5.0,
            f"Tasa de rechazo o cancelación del {cancellation}%, superando el umbral operativo tolerable del 5%.",
        ),
        (
            margin < 45.0 and kpi_data.revenue.current > 0,
            f"Margen bruto comprimido ({margin}%): alto impacto del costo de insumos (${kpi_data.cogs.current:,.2f}) sobre el precio de venta.",
        ),
    ]
    return [text for applies, text in detected if applies] or [
        f"Operación fluida con demora promedio de {op_context.avg_wait_minutes} min y tasa de rechazo controlada en {cancellation}%."
    ]


def _rule_based_recommendations(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> list[str]:
    ticket = kpi_data.average_ticket.current
    top_product = kpi_data.top_products[0] if kpi_data.top_products else None
    goal = kpi_data.goal
    suggested = [
        (
            op_context.peak_hour is not None and peak_hour_pct >= 25.0,
            f"Reforzar personal de cocina y pre-elaborar bases (mise en place) antes de las {op_context.peak_hour or 0:02d}:00 hs para agilizar el pico de {op_context.peak_hour_orders} pedidos.",
        ),
        (
            op_context.avg_wait_minutes >= 35.0,
            "Ajustar los tiempos de demora estimada informados al cliente y limitar pedidos entrantes cuando la cocina supere los 40 minutos de demora.",
        ),
        (
            top_product is not None,
            f"Crear combos de '{top_product.product_name if top_product else ''}' combinados con bebidas de alto margen para incrementar el ticket promedio actual de ${ticket:,.2f}.",
        ),
        (
            kpi_data.cancellation_rate.current > 5.0,
            "Contactar a clientes con pedidos cancelados para evaluar si el motivo fue demora excesiva o falta de stock de ingredientes.",
        ),
        (
            goal is not None and goal.revenue_progress_pct < 80,
            f"Impulsar promociones por canal digital: faltan ${goal.revenue_remaining if goal else 0:,.2f} para alcanzar la meta comercial del período.",
        ),
    ]
    return [text for applies, text in suggested if applies] or [
        "Mantener el ritmo de despacho actual y monitorear los costos de los insumos principales."
    ]


def _rule_based_insight(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> _InsightText:
    """Análisis determinístico basado en reglas de negocio, para cuando no hay IA disponible o falla."""
    growth = kpi_data.revenue.growth_pct
    margin = kpi_data.gross_margin_pct
    variation = (
        f"Las ventas reflejan una variación de {growth}% vs. el período anterior."
        if growth is not None
        else "El volumen de ventas se mantiene estable."
    )
    summary = (
        f"El negocio registró una facturación de ${kpi_data.revenue.current:,.2f} ({kpi_data.completed_orders_count} pedidos finalizados) con un margen bruto promedio del {margin}%. "
        + variation
    )
    highlights = [
        f"Ticket promedio situado en ${kpi_data.average_ticket.current:,.2f} por pedido finalizado.",
        f"Margen bruto comercial del {margin}% sobre los productos vendidos.",
        *[
            f"Plato más vendido: '{top.product_name}' con {top.total_quantity} unidades."
            for top in kpi_data.top_products[:1]
        ],
    ]
    return _InsightText(
        summary,
        highlights,
        _rule_based_weaknesses(kpi_data, op_context, peak_hour_pct),
        _rule_based_recommendations(kpi_data, op_context, peak_hour_pct),
    )


def generate_strategic_insight(
    kpi_data: DashboardKpis,
    db: Session | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> StrategicInsight:
    """Genera un análisis comercial y operativo ejecutivo utilizando IA / BI para interpretar KPIs,

    tiempos de espera, flujo de pedidos y metas del negocio.
    """
    op_data = (
        get_operational_flow_and_wait_times(db, date_from, date_to)
        if db is not None
        else _estimated_operational_data(kpi_data)
    )
    op_context = _operational_context(op_data)
    peak_hour_pct = op_data.get("peak_hour_pct", 0)

    # La IA solo se usa si hay credenciales configuradas y responde algo interpretable.
    insight = (
        _insight_from_gemini(kpi_data, op_context, peak_hour_pct) if settings.GOOGLE_API_KEY else None
    ) or _rule_based_insight(kpi_data, op_context, peak_hour_pct)

    return StrategicInsight(
        summary=insight.summary,
        highlights=insight.highlights,
        warnings=insight.weaknesses,
        operational_weaknesses=insight.weaknesses,
        recommendations=insight.recommendations,
        operational_metrics=op_context,
        generated_at=datetime.now(timezone.utc),
    )
