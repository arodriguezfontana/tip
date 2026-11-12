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
from app.models.menu import Product
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
class TopPromotionKpi:
    promotion_name: str
    total_quantity: int
    total_revenue: float


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
    top_promotions: list[TopPromotionKpi] = field(default_factory=list)


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
    spending_recommendations: list[str] = field(default_factory=list)
    operational_metrics: OperationalMetrics | None = None
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
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
    current: float, previous: float, higher_is_better: bool = True, has_previous_period: bool = True
) -> GrowthMetric:
    """Calcula la variación porcentual entre el período actual y el anterior con dirección y semántica de negocio."""
    curr = float(current)
    prev = float(previous)
    if not has_previous_period:
        return GrowthMetric(
            current=round(curr, 2),
            previous=0.0,
            growth_pct=None,
            trend="neutral",
            is_positive=True,
        )
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
    has_prev = previous_period is not None and previous_day is not None and previous_day.total_revenue is not None
    growth = calculate_growth_metric(
        current_day.total_revenue or 0.0,
        (previous_day.total_revenue or 0.0) if previous_day else 0.0,
        has_previous_period=has_prev,
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
    gross_profit = round(rev - estimated_cost, 2)
    previous_qty, previous_rev = previous or (0, 0.0)
    has_prev = previous is not None
    return TopProductKpi(
        product_name=name,
        total_quantity=qty,
        total_revenue=rev,
        estimated_cost=estimated_cost,
        gross_profit=gross_profit,
        margin_pct=round((gross_profit / rev * 100.0), 1) if rev > 0 else 0.0,
        quantity_growth_pct=calculate_growth_metric(qty, previous_qty, has_previous_period=has_prev).growth_pct if has_prev else None,
        revenue_growth_pct=calculate_growth_metric(rev, previous_rev, has_previous_period=has_prev).growth_pct if has_prev else None,
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


def _top_promotions_kpis(
    db: Session, date_from: datetime | None, date_to: datetime | None, limit: int = 3
) -> list[TopPromotionKpi]:
    """Las promociones más vendidas del período."""
    try:
        promos = order_repository.best_selling_promotions(db, date_from, date_to, limit=limit)
        return [
            TopPromotionKpi(
                promotion_name=str(name),
                total_quantity=int(qty),
                total_revenue=float(rev),
            )
            for name, qty, rev in promos
        ]
    except Exception:
        return []


def calculate_dashboard_kpis(
    db: Session, date_from: datetime | None = None, date_to: datetime | None = None
) -> DashboardKpis:
    """Calcula todas las métricas de rendimiento comercial, rentabilidad bruta, tendencias y metas."""
    prev_from, prev_to = get_previous_period(date_from, date_to)
    previous_period = (prev_from, prev_to) if prev_from and prev_to else None
    has_prev = previous_period is not None

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
    curr_gross_profit = round(curr_rev - curr_cogs, 2)
    prev_gross_profit = round(prev_rev - prev_cogs, 2)

    # Metas y progreso (basado en pedidos finalizados reales)
    goal_progress = _with_goal_progress(
        _determine_target_goal(db, date_from, date_to), curr_rev, completed_orders
    )

    return DashboardKpis(
        revenue=calculate_growth_metric(curr_rev, prev_rev, has_previous_period=has_prev),
        orders_count=calculate_growth_metric(curr_billable_count, prev_billable_count, has_previous_period=has_prev),
        completed_orders_count=completed_orders,
        average_ticket=calculate_growth_metric(
            _average_ticket(curr_rev, completed_orders, curr_billable_count),
            _average_ticket(prev_rev, prev_completed_orders, prev_billable_count),
            has_previous_period=has_prev,
        ),
        cancellation_rate=calculate_growth_metric(
            _cancellation_rate(status_dist),
            _cancellation_rate(prev_status_dist),
            higher_is_better=False,
            has_previous_period=has_prev,
        ),
        cogs=calculate_growth_metric(curr_cogs, prev_cogs, higher_is_better=False, has_previous_period=has_prev),
        gross_profit=calculate_growth_metric(curr_gross_profit, prev_gross_profit, has_previous_period=has_prev),
        gross_margin_pct=round((curr_gross_profit / curr_rev * 100.0), 1) if curr_rev > 0 else 0.0,
        goal=goal_progress,
        best_selling_day=_best_selling_day_summary(db, date_from, date_to, previous_period),
        status_distribution=status_dist,
        top_products=_top_products_kpis(db, date_from, date_to, previous_period),
        top_promotions=_top_promotions_kpis(db, date_from, date_to, limit=3),
    )


# --- Asistente Inteligente de Análisis Comercial (LLM / BI) -------------------------------------------


class _InsightText(NamedTuple):
    summary: str
    highlights: list[str]
    weaknesses: list[str]
    recommendations: list[str]
    spending_recommendations: list[str] = []


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
    kpi_data: DashboardKpis,
    op_context: OperationalMetrics,
    peak_hour_pct: float,
    db: Session | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> str:
    if op_context.peak_hour is None:
        peak_str = "Sin concentración significativa"
    else:
        peak_str = f"{op_context.peak_hour:02d}:00 hs ({op_context.peak_hour_orders} pedidos, {peak_hour_pct}% del volumen)"
    star_products = ", ".join(
        f"{p.product_name} ({p.total_quantity}u, margen {p.margin_pct}%)" for p in kpi_data.top_products[:3]
    )
    goal_progress = kpi_data.goal.revenue_progress_pct if kpi_data.goal else "N/A"

    # Consumo de ingredientes en el período
    ing_lines = []
    if db is not None:
        try:
            consumed = consumption_totals(db, date_from, date_to, ingredient_id=None)
            for _, name, unit, qty in sorted(consumed, key=lambda c: c[3], reverse=True)[:6]:
                ing_lines.append(f"- {name}: {qty:.1f} {unit}")
        except Exception:
            pass
    ing_text = "\n".join(ing_lines) if ing_lines else "- Sin detalle de ingredientes registrado en el período"

    return f"""
Sos un consultor experto en optimización gastronómica para el dueño de un restaurante.
Tu objetivo es darle un análisis claro, directo y muy fácil de entender, sin tecnicismos ni palabras complejas.
Basate ÚNICAMENTE en estos datos reales del negocio:

DATOS REALES:
- Facturación: ${kpi_data.revenue.current:,.2f} (Variación vs anterior: {kpi_data.revenue.growth_pct or 0}%)
- Pedidos totales: {kpi_data.orders_count.current} (Finalizados: {kpi_data.completed_orders_count})
- Ticket promedio: ${kpi_data.average_ticket.current:,.2f}
- Cancelaciones: {kpi_data.cancellation_rate.current}%
- Margen de ganancia: {kpi_data.gross_margin_pct}% (Ganancia: ${kpi_data.gross_profit.current:,.2f}, Costo insumos: ${kpi_data.cogs.current:,.2f})
- Meta cumplida: {goal_progress}%
- Platos más vendidos: {star_products or 'Sin ventas'}
- Demora promedio: {op_context.avg_wait_minutes} min (máxima: {op_context.max_wait_minutes} min, demora >= 45 min: {op_context.high_wait_count})
- Hora pico: {peak_str}
- Modalidad: {op_context.delivery_pct}% delivery / {op_context.pickup_pct}% retiro

CONSUMO PRINCIPAL DE INGREDIENTES:
{ing_text}

REGLAS ESTRICTAS DE RESPUESTA:
1. Lenguaje simple, conciso y fácil de entender. Directo al grano.
2. Cita cifras reales, nunca inventes datos.
3. Generá EXACTAMENTE:
   - "summary": Diagnóstico general conciso de 1 párrafo breve citando métricas clave.
   - "operational_weaknesses": Lista de EXACTAMENTE 3 debilidades o aspectos a mejorar.
   - "highlights": Lista de EXACTAMENTE 3 oportunidades o puntos fuertes del período.
   - "recommendations": Lista de EXACTAMENTE 6 recomendaciones generales de acción prácticas para mejorar ventas, ganar más margen, perder menos dinero por cancelaciones y optimizar tiempos (sin numeración ordinal en el texto).
   - "spending_recommendations": Lista de EXACTAMENTE 4 a 5 recomendaciones de compras y control de gastos (sin numeración ordinal) indicando qué insumos comprar más por alta rotación, qué comprar menos o regular por baja rotación y cómo optimizar costos de materias primas.

Respondé en español ÚNICAMENTE con un objeto JSON válido con este esquema exacto:
{{
  "summary": "Diagnóstico breve y claro del período.",
  "operational_weaknesses": [
    "Debilidad 1",
    "Debilidad 2",
    "Debilidad 3"
  ],
  "highlights": [
    "Oportunidad 1",
    "Oportunidad 2",
    "Oportunidad 3"
  ],
  "recommendations": [
    "Recomendación 1",
    "Recomendación 2",
    "Recomendación 3",
    "Recomendación 4",
    "Recomendación 5",
    "Recomendación 6"
  ],
  "spending_recommendations": [
    "Recomendación compras 1",
    "Recomendación compras 2",
    "Recomendación compras 3",
    "Recomendación compras 4"
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
        or parsed.get("weaknesses")
        or ["No se detectaron cuellos de botella críticos en las comandas del período."],
        recommendations=parsed.get("recommendations")
        or ["Revisar márgenes y tiempos en las horas de mayor demanda."],
        spending_recommendations=parsed.get("spending_recommendations") or [],
    )


def _insight_from_gemini(
    kpi_data: DashboardKpis,
    op_context: OperationalMetrics,
    peak_hour_pct: float,
    db: Session | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> _InsightText | None:
    """El análisis que redacta Gemini, o None si no se pudo obtener."""
    try:
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content(
            model=modelos.principal,
            contents=_build_insight_prompt(kpi_data, op_context, peak_hour_pct, db, date_from, date_to),
        )
        return _insight_from_model_answer(response.text or "")
    except Exception as e:
        logger.warning("Fallo al consultar Gemini para insights comerciales: %s", e)
        return None


def _rule_based_weaknesses(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> list[str]:
    cancellation = kpi_data.cancellation_rate.current
    margin = kpi_data.gross_margin_pct

    # Punto 1: Tiempos de cocina y demoras
    if op_context.avg_wait_minutes >= 35.0 or op_context.high_wait_count > 0:
        p1 = f"Demoras elevadas en cocina: promedio de {op_context.avg_wait_minutes} min (máx {op_context.max_wait_minutes} min), con {op_context.high_wait_count} pedidos superando los 45 min."
    else:
        p1 = f"Tiempos de entrega: demora promedio de {op_context.avg_wait_minutes} min, con margen de mejora en momentos de mayor volumen."

    # Punto 2: Hora pico o concentración de pedidos
    if op_context.peak_hour is not None and peak_hour_pct >= 25.0:
        p2 = f"Cuello de botella en hora pico: el {peak_hour_pct}% de los pedidos se concentró a las {op_context.peak_hour or 0:02d}:00 hs ({op_context.peak_hour_orders} pedidos)."
    else:
        p2 = "Demanda irregular: baja cantidad de pedidos fuera del horario central."

    # Punto 3: Cancelaciones o margen de ganancia
    if cancellation > 3.0:
        p3 = f"Tasa de cancelación del {cancellation}%, lo que representa pérdida de ventas directas."
    elif margin < 50.0 and kpi_data.revenue.current > 0:
        p3 = f"Margen bruto ajustado ({margin}%): alto impacto del costo de insumos (${kpi_data.cogs.current:,.2f}) sobre las ventas."
    else:
        p3 = "Control de costos: margen estable pero susceptible a aumentos de precios en ingredientes principales."

    return [p1, p2, p3]


def _rule_based_highlights(
    kpi_data: DashboardKpis, op_context: OperationalMetrics
) -> list[str]:
    top_product = kpi_data.top_products[0] if kpi_data.top_products else None

    # Punto 1: Plato estrella
    if top_product:
        p1 = f"Plato más vendido: '{top_product.product_name}' lidera con {top_product.total_quantity} unidades y un margen del {top_product.margin_pct}%."
    else:
        p1 = "Potencial para promocionar un plato insignia e impulsar la demanda."

    # Punto 2: Ticket promedio
    p2 = f"Ticket promedio situado en ${kpi_data.average_ticket.current:,.2f}: oportunidad para sumar bebidas y postres como adicionales."

    # Punto 3: Modalidad de entrega
    if op_context.delivery_pct >= 50.0:
        p3 = f"Canal de delivery consolidado ({op_context.delivery_pct}% de ventas): potencial para sumar promociones exclusivas de retiro."
    else:
        p3 = f"Buena afluencia de retiro en local ({op_context.pickup_pct}%): posibilidad de incentivar pedidos por delivery en días tranquilos."

    return [p1, p2, p3]


def _rule_based_recommendations(
    kpi_data: DashboardKpis, op_context: OperationalMetrics, peak_hour_pct: float
) -> list[str]:
    top_product = kpi_data.top_products[0] if kpi_data.top_products else None
    peak_h = op_context.peak_hour or 20
    goal = kpi_data.goal
    top_name = top_product.product_name if top_product else "plato principal"

    # 1. Perder menos dinero / Cancelaciones
    if kpi_data.cancellation_rate.current > 0:
        r1 = f"Reducir cancelaciones (actualmente en {kpi_data.cancellation_rate.current}%): informar al cliente el tiempo de espera real y el estado del pedido para evitar ventas caídas."
    else:
        r1 = "Cuidar cancelaciones: mantener la confirmación ágil y la comunicación clara de tiempos de espera para sostener la tasa en 0%."

    # 2. Ganar más / Ticket promedio con adicionales
    r2 = f"Aumentar el ticket promedio (hoy en ${kpi_data.average_ticket.current:,.2f}): ofrecer bebidas, postres y adicionales en cada pedido antes de cerrar la venta."

    # 3. Ventas de platos estrella y combos
    r3 = f"Promocionar combos de '{top_name}' con bebidas para aumentar el ticket promedio e impulsar el volumen de facturación."

    # 4. Agilizar tiempos en horas pico / Eficiencia operativa
    r4 = f"Preparar la mise en place antes de las {peak_h:02d}:00 hs para agilizar el despacho de cocina durante la hora pico de mayor demanda."

    # 5. Ganar más margen / Rentabilidad
    r5 = f"Proteger el margen bruto (actualmente en {kpi_data.gross_margin_pct}%): revisar acuerdos de precios con proveedores de insumos de mayor costo para proteger el margen de ganancia."

    # 6. Alcanzar metas / Ventas en días de menor demanda
    if goal and goal.revenue_remaining > 0:
        r6 = f"Lanzar promociones en días de menor demanda para alcanzar los ${goal.revenue_remaining:,.2f} restantes de la meta."
    else:
        r6 = "Fidelizar a los clientes más recurrentes con promociones en días tranquilos para sostener el ritmo de crecimiento de ventas."

    return [r1, r2, r3, r4, r5, r6]


def _rule_based_spending_recommendations(
    kpi_data: DashboardKpis,
    db: Session | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[str]:
    recs: list[str] = []
    consumed: list[tuple[int, str, str, float]] = []

    if db is not None:
        try:
            consumed = consumption_totals(db, date_from, date_to, ingredient_id=None)
        except Exception:
            consumed = []

    top_p = kpi_data.top_products[0] if kpi_data.top_products else None

    # 1. Comprar más / asegurar stock del insumo de mayor consumo o vinculado al plato estrella
    if consumed:
        by_qty = sorted(consumed, key=lambda c: c[3], reverse=True)
        top_ing = by_qty[0]
        if top_p:
            recs.append(
                f"Comprar con mayor volumen: '{top_ing[1]}' es el insumo más consumido ({top_ing[3]:.1f} {top_ing[2]}), impulsado por '{top_p.product_name}'. Conviene negociar compra mayorista o bulto cerrado para abaratar costos."
            )
        else:
            recs.append(
                f"Comprar con mayor volumen: asegurar stock de '{top_ing[1]}' ({top_ing[3]:.1f} {top_ing[2]} consumidos en el período) para evitar quiebres de stock en cocina."
            )
    elif top_p:
        recs.append(
            f"Comprar con mayor volumen: asegurar stock prioritario de los insumos principales de '{top_p.product_name}' ({top_p.total_quantity} unidades vendidas) y negociar descuento por cantidad con proveedores."
        )
    else:
        recs.append(
            "Planificar compras por volumen: negociar bultos cerrados de materias primas no perecederas con proveedores habituales para abaratar el costo unitario."
        )

    # 2. Comprar menos / regular stock de insumos con baja rotación o platos menos vendidos
    if db is not None:
        try:
            sold_names = {p.product_name for p in kpi_data.top_products}
            all_active = db.query(Product).filter(Product.is_active == True).all()
            unsold = [p for p in all_active if p.name not in sold_names]

            low_turnover_ing: str | None = None
            low_turnover_prod: str | None = None
            if unsold:
                for p in unsold:
                    for item in p.recipe_items:
                        if item.ingredient and item.ingredient.name:
                            low_turnover_ing = item.ingredient.name
                            low_turnover_prod = p.name
                            break
                    if low_turnover_ing:
                        break

            if low_turnover_ing and low_turnover_prod:
                recs.append(
                    f"Comprar menos / regular stock: '{low_turnover_ing}' se utiliza en platos con baja rotación en este período ('{low_turnover_prod}'). Comprá solo lo justo para evitar vencimientos o dinero inmovilizado."
                )
            elif consumed and len(consumed) > 1:
                least_ing = sorted(consumed, key=lambda c: c[3])[0]
                recs.append(
                    f"Comprar menos / ajustar compras: '{least_ing[1]}' registró muy bajo consumo ({least_ing[3]:.1f} {least_ing[2]}). Reducí el pedido semanal para no sobrecargar el inventario."
                )
            else:
                recs.append(
                    "Comprar menos en baja rotación: limitar la compra de insumos específicos para platos secundarios o poco pedidos para prevenir mermas."
                )
        except Exception:
            recs.append(
                "Comprar menos en baja rotación: reducir las órdenes de compra de ingredientes exclusivos para platos de baja demanda y evitar desperdicios."
            )
    else:
        recs.append(
            "Comprar menos en baja rotación: regular la adquisición de insumos perecederos para platos secundarios o de menor venta para no inmovilizar capital."
        )

    # 3. Control de gastos en insumo de mayor costo monetario
    if consumed and db is not None:
        try:
            ing_ids = {c[0] for c in consumed}
            ingredients = ingredient_repository.get_many(db, ing_ids)
            spent_list = [
                (c[1], c[3] * float(ingredients[c[0]].cost or 0), c[2])
                for c in consumed
                if c[0] in ingredients and (ingredients[c[0]].cost or 0) > 0
            ]
            if spent_list:
                highest_spent = sorted(spent_list, key=lambda s: s[1], reverse=True)[0]
                if highest_spent[1] > 0:
                    recs.append(
                        f"Control de gastos en '{highest_spent[0]}': representó el mayor gasto en materias primas (${highest_spent[1]:,.2f}). Compará listas de precios entre distintos proveedores para proteger el margen."
                    )
        except Exception:
            pass

    if len(recs) < 3 and kpi_data.cogs.current > 0:
        recs.append(
            f"Control de costos de mercadería: el gasto total de insumos fue de ${kpi_data.cogs.current:,.2f}. Pedí listas de precios a proveedores alternativos para reducir el costo por lote."
        )

    # 4. Platos con margen bajo o ajuste de recetas
    low_margin_p = min(kpi_data.top_products, key=lambda p: p.margin_pct) if kpi_data.top_products else None
    if low_margin_p and low_margin_p.margin_pct < 60:
        recs.append(
            f"Revisar receta o precio de '{low_margin_p.product_name}' (margen del {low_margin_p.margin_pct}%): el costo de sus insumos (${low_margin_p.estimated_cost:,.2f}) absorbe una parte alta del precio. Ajustá porciones o su valor de venta."
        )
    else:
        recs.append(
            "Estandarizar porciones en cocina: controlar el pesaje de ingredientes clave al despachar platos para evitar desvíos entre el costo teórico y el gasto real."
        )

    # 5. Mermas y rotación de depósito
    recs.append(
        "Control de mermas y almacenamiento: aplicar sistema FIFO (primero en entrar, primero en salir) en heladera y depósito para insumos frescos de alta rotación."
    )

    return recs[:5]


def _rule_based_insight(
    kpi_data: DashboardKpis,
    op_context: OperationalMetrics,
    peak_hour_pct: float,
    db: Session | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> _InsightText:
    """Análisis determinístico basado en reglas de negocio, para cuando no hay IA disponible o falla."""
    growth = kpi_data.revenue.growth_pct
    variation = (
        f"Las ventas tuvieron una variación de {growth}% vs. el período anterior."
        if growth is not None
        else "El volumen de ventas se mantiene estable."
    )
    summary = (
        f"Facturación de ${kpi_data.revenue.current:,.2f} con {kpi_data.completed_orders_count} pedidos finalizados y un margen del {kpi_data.gross_margin_pct}%. "
        + variation
    )
    return _InsightText(
        summary,
        _rule_based_highlights(kpi_data, op_context),
        _rule_based_weaknesses(kpi_data, op_context, peak_hour_pct),
        _rule_based_recommendations(kpi_data, op_context, peak_hour_pct),
        _rule_based_spending_recommendations(kpi_data, db, date_from, date_to),
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
    has_activity = (
        kpi_data.revenue.current > 0
        or kpi_data.completed_orders_count > 0
        or kpi_data.orders_count.current > 0
    )
    if not has_activity:
        return StrategicInsight(
            summary="No hay datos suficientes en este período para elaborar un análisis con IA. Seleccioná un rango de fechas con ventas registradas.",
            highlights=[],
            warnings=[],
            operational_weaknesses=[],
            recommendations=[],
            spending_recommendations=[],
            operational_metrics=None,
            generated_at=datetime.now(timezone.utc),
        )

    op_data = (
        get_operational_flow_and_wait_times(db, date_from, date_to)
        if db is not None
        else _estimated_operational_data(kpi_data)
    )
    op_context = _operational_context(op_data)
    peak_hour_pct = op_data.get("peak_hour_pct", 0)

    # La IA solo se usa si hay credenciales configuradas y responde algo interpretable.
    insight = (
        _insight_from_gemini(kpi_data, op_context, peak_hour_pct, db, date_from, date_to) if settings.GOOGLE_API_KEY else None
    ) or _rule_based_insight(kpi_data, op_context, peak_hour_pct, db, date_from, date_to)

    spending_recs = insight.spending_recommendations or _rule_based_spending_recommendations(
        kpi_data, db, date_from, date_to
    )

    return StrategicInsight(
        summary=insight.summary,
        highlights=insight.highlights,
        warnings=insight.weaknesses,
        operational_weaknesses=insight.weaknesses,
        recommendations=insight.recommendations,
        spending_recommendations=spending_recs,
        operational_metrics=op_context,
        generated_at=datetime.now(timezone.utc),
    )
