"""Servicio de análisis comercial avanzado, cálculo de KPIs estratégicos, metas y evaluación de rentabilidad."""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories import analytics_repository, order_repository
from app.schemas.analytics_schemas import (
    BusinessGoalItem,
    BusinessGoalsResponse,
    DashboardKPIsResponse,
    GoalProgress,
    GrowthMetric,
    OperationalMetricsContext,
    StrategicInsightResponse,
    TopProductKpi,
    UpdateBusinessGoalsPayload,
)
from app.services import stats_service
from app.services.gemini_models import modelos

logger = logging.getLogger(__name__)


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


def calculate_growth_metric(
    current: float, previous: float, higher_is_better: bool = True
) -> GrowthMetric:
    """Calcula la variación porcentual entre el período actual y el anterior con dirección y semántica de negocio."""
    curr = float(current)
    prev = float(previous)

    if prev == 0.0:
        if curr > 0.0:
            growth_pct = 100.0
            trend = "up"
        elif curr < 0.0:
            growth_pct = -100.0
            trend = "down"
        else:
            growth_pct = 0.0
            trend = "neutral"
    else:
        growth_pct = round(((curr - prev) / abs(prev)) * 100.0, 1)
        if growth_pct > 0.1:
            trend = "up"
        elif growth_pct < -0.1:
            trend = "down"
        else:
            trend = "neutral"

    is_positive = (trend == "up" or trend == "neutral") if higher_is_better else (trend == "down" or trend == "neutral")

    return GrowthMetric(
        current=round(curr, 2),
        previous=round(prev, 2),
        growth_pct=growth_pct if (prev != 0.0 or curr != 0.0) else None,
        trend=trend,
        is_positive=is_positive,
    )


# --- Metas de Negocio ---------------------------------------------------------------------------------


def get_business_goals(db: Session) -> BusinessGoalsResponse:
    goals = analytics_repository.list_goals(db)
    return BusinessGoalsResponse(
        goals=[
            BusinessGoalItem(
                period_type=g.period_type,
                target_revenue=float(g.target_revenue or 0),
                target_orders=g.target_orders or 0,
                updated_at=g.updated_at,
            )
            for g in goals
        ]
    )


def update_business_goals(db: Session, payload: UpdateBusinessGoalsPayload) -> BusinessGoalsResponse:
    for item in payload.goals:
        analytics_repository.upsert_goal(
            db,
            period_type=item.period_type,
            target_revenue=item.target_revenue,
            target_orders=item.target_orders,
        )
    return get_business_goals(db)


def _determine_target_goal(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> GoalProgress | None:
    """Determina la meta comercial que mejor se adapta al período seleccionado y calcula el progreso."""
    goals_resp = get_business_goals(db)
    goals_by_type = {g.period_type: g for g in goals_resp.goals}

    if not date_from or not date_to:
        target = goals_by_type.get("monthly")
        period_key = "monthly"
    else:
        days = max(1.0, (date_to - date_from).total_seconds() / 86400.0)
        if days <= 1.5:
            target = goals_by_type.get("daily") or goals_by_type.get("monthly")
            period_key = "daily"
        elif days <= 8.5:
            target = goals_by_type.get("weekly") or goals_by_type.get("monthly")
            period_key = "weekly"
        else:
            target = goals_by_type.get("monthly")
            period_key = "monthly"

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


# --- Dashboard de KPIs y Rendimiento -------------------------------------------------------------------


def calculate_dashboard_kpis(
    db: Session, date_from: datetime | None = None, date_to: datetime | None = None
) -> DashboardKPIsResponse:
    """Calcula todas las métricas de rendimiento comercial, rentabilidad bruta, tendencias y metas."""
    prev_from, prev_to = get_previous_period(date_from, date_to)

    # 1. Facturación y Conteo de pedidos
    curr_rev, curr_billable_count = analytics_repository.billable_revenue_and_count(db, date_from, date_to)
    prev_rev, prev_billable_count = (
        analytics_repository.billable_revenue_and_count(db, prev_from, prev_to)
        if prev_from and prev_to
        else (0.0, 0)
    )

    revenue_metric = calculate_growth_metric(curr_rev, prev_rev, higher_is_better=True)
    orders_metric = calculate_growth_metric(curr_billable_count, prev_billable_count, higher_is_better=True)

    # 2. Distribución de estados y tasas de rechazo / cancelación
    status_dist = analytics_repository.order_counts_by_status(db, date_from, date_to)
    prev_status_dist = (
        analytics_repository.order_counts_by_status(db, prev_from, prev_to) if prev_from and prev_to else {}
    )

    curr_total_orders = sum(status_dist.values())
    prev_total_orders = sum(prev_status_dist.values())

    completed_orders = status_dist.get("Finalizado", 0)
    prev_completed_orders = prev_status_dist.get("Finalizado", 0)

    # Ticket promedio = total facturado / pedidos finalizados (o facturables si no hay finalizados aún)
    divisor_curr = completed_orders if completed_orders > 0 else (curr_billable_count if curr_billable_count > 0 else 1)
    divisor_prev = prev_completed_orders if prev_completed_orders > 0 else (prev_billable_count if prev_billable_count > 0 else 1)

    curr_ticket = curr_rev / divisor_curr if (completed_orders > 0 or curr_billable_count > 0) else 0.0
    prev_ticket = prev_rev / divisor_prev if (prev_completed_orders > 0 or prev_billable_count > 0) else 0.0

    avg_ticket_metric = calculate_growth_metric(curr_ticket, prev_ticket, higher_is_better=True)

    # Tasa de rechazo / cancelación
    rejected_and_cancelled_curr = status_dist.get("Rechazado", 0) + status_dist.get("Cancelado", 0)
    rejected_and_cancelled_prev = prev_status_dist.get("Rechazado", 0) + prev_status_dist.get("Cancelado", 0)

    curr_cancel_rate = (rejected_and_cancelled_curr / curr_total_orders * 100.0) if curr_total_orders > 0 else 0.0
    prev_cancel_rate = (rejected_and_cancelled_prev / prev_total_orders * 100.0) if prev_total_orders > 0 else 0.0

    cancel_rate_metric = calculate_growth_metric(curr_cancel_rate, prev_cancel_rate, higher_is_better=False)

    # 3. Integración de Costos y Rentabilidad Bruta (COGS y Margen)
    curr_cogs, _ = analytics_repository.calculate_cogs(db, date_from, date_to)
    prev_cogs, _ = analytics_repository.calculate_cogs(db, prev_from, prev_to) if prev_from and prev_to else (0.0, {})

    cogs_metric = calculate_growth_metric(curr_cogs, prev_cogs, higher_is_better=False)

    curr_gross_profit = max(0.0, curr_rev - curr_cogs)
    prev_gross_profit = max(0.0, prev_rev - prev_cogs)
    gross_profit_metric = calculate_growth_metric(curr_gross_profit, prev_gross_profit, higher_is_better=True)

    gross_margin_pct = round((curr_gross_profit / curr_rev * 100.0), 1) if curr_rev > 0 else 0.0

    # 4. Metas y progreso
    goal_progress = _determine_target_goal(db, date_from, date_to)
    if goal_progress:
        if goal_progress.target_revenue > 0:
            goal_progress.revenue_progress_pct = round(
                (curr_rev / goal_progress.target_revenue) * 100.0, 1
            )
            goal_progress.revenue_remaining = max(0.0, goal_progress.target_revenue - curr_rev)
        if goal_progress.target_orders > 0:
            effective_orders = completed_orders if completed_orders > 0 else curr_billable_count
            goal_progress.orders_progress_pct = round(
                (effective_orders / goal_progress.target_orders) * 100.0, 1
            )
            goal_progress.orders_remaining = max(0, goal_progress.target_orders - effective_orders)

    # 5. Día más rentable
    curr_best_day = stats_service.best_selling_day(db, date_from, date_to)
    prev_best_day = stats_service.best_selling_day(db, prev_from, prev_to) if prev_from and prev_to else None

    best_day_growth = calculate_growth_metric(
        curr_best_day.total_revenue or 0.0,
        (prev_best_day.total_revenue or 0.0) if prev_best_day else 0.0,
        higher_is_better=True,
    )

    # 6. Top productos con costo y margen
    raw_top = order_repository.best_selling_products(db, date_from, date_to, limit=6)
    product_names = [name for name, _, _ in raw_top]
    unit_costs = analytics_repository.get_products_unit_cost(db, product_names)

    # Buscar ventas del período anterior para calcular growth por producto
    prev_top_map = {}
    if prev_from and prev_to:
        prev_raw = order_repository.best_selling_products(db, prev_from, prev_to, limit=20)
        prev_top_map = {name: (qty, rev) for name, qty, rev in prev_raw}

    top_products_kpis: list[TopProductKpi] = []
    for name, qty, rev in raw_top:
        q = int(qty)
        r = float(rev)
        u_cost = unit_costs.get(name, 0.0)
        est_cost = round(q * u_cost, 2)
        profit = round(max(0.0, r - est_cost), 2)
        margin = round((profit / r * 100.0), 1) if r > 0 else 0.0

        prev_q, prev_r = prev_top_map.get(name, (0, 0.0))
        q_growth = calculate_growth_metric(q, prev_q).growth_pct if prev_from else None
        r_growth = calculate_growth_metric(r, prev_r).growth_pct if prev_from else None

        top_products_kpis.append(
            TopProductKpi(
                product_name=name,
                total_quantity=q,
                total_revenue=r,
                estimated_cost=est_cost,
                gross_profit=profit,
                margin_pct=margin,
                quantity_growth_pct=q_growth,
                revenue_growth_pct=r_growth,
            )
        )

    return DashboardKPIsResponse(
        revenue=revenue_metric,
        orders_count=orders_metric,
        completed_orders_count=completed_orders,
        average_ticket=avg_ticket_metric,
        cancellation_rate=cancel_rate_metric,
        cogs=cogs_metric,
        gross_profit=gross_profit_metric,
        gross_margin_pct=gross_margin_pct,
        goal=goal_progress,
        best_selling_day={
            "day": curr_best_day.weekday,
            "revenue": curr_best_day.total_revenue,
            "growth_pct": best_day_growth.growth_pct,
            "trend": best_day_growth.trend,
        },
        status_distribution=status_dist,
        top_products=top_products_kpis,
    )


# --- Asistente Inteligente de Análisis Comercial (LLM / BI) -------------------------------------------


def generate_strategic_insight(
    kpi_data: DashboardKPIsResponse,
    db: Session | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> StrategicInsightResponse:
    """Genera un análisis comercial y operativo ejecutivo utilizando IA / BI para interpretar KPIs,

    tiempos de espera, flujo de pedidos y metas del negocio.
    """
    now_dt = datetime.now(timezone.utc)

    # Métricas operativas extraídas del período
    op_data = (
        analytics_repository.get_operational_flow_and_wait_times(db, date_from, date_to)
        if db is not None
        else {
            "total_orders": kpi_data.orders_count.current,
            "avg_wait_minutes": 25.0,
            "max_wait_minutes": 40,
            "high_wait_count": 0,
            "high_wait_pct": 0.0,
            "peak_hour": 21,
            "peak_hour_orders": max(1, int(kpi_data.orders_count.current * 0.4)),
            "peak_hour_pct": 40.0,
            "delivery_count": int(kpi_data.orders_count.current * 0.7),
            "pickup_count": int(kpi_data.orders_count.current * 0.3),
            "delivery_pct": 70.0,
            "pickup_pct": 30.0,
            "sources": {"bot": kpi_data.orders_count.current},
        }
    )

    op_context = OperationalMetricsContext(
        avg_wait_minutes=float(op_data.get("avg_wait_minutes", 0.0)),
        max_wait_minutes=int(op_data.get("max_wait_minutes", 0)),
        high_wait_count=int(op_data.get("high_wait_count", 0)),
        high_wait_pct=float(op_data.get("high_wait_pct", 0.0)),
        peak_hour=op_data.get("peak_hour"),
        peak_hour_orders=int(op_data.get("peak_hour_orders", 0)),
        delivery_pct=float(op_data.get("delivery_pct", 0.0)),
        pickup_pct=float(op_data.get("pickup_pct", 0.0)),
    )

    # Intentar generar síntesis con IA si hay credenciales configuradas
    if settings.GOOGLE_API_KEY:
        try:
            from google import genai

            client = genai.Client(api_key=settings.GOOGLE_API_KEY)
            peak_str = (
                f"{op_context.peak_hour:02d}:00 hs ({op_context.peak_hour_orders} pedidos, {op_data.get('peak_hour_pct', 0)}% del volumen)"
                if op_context.peak_hour is not None
                else "Sin concentración significativa"
            )

            prompt = f"""
Sos un consultor experto en optimización gastronómica y Business Intelligence para el dueño de un restaurante.
Analizá los siguientes datos y estadísticas reales del negocio correspondientes al período seleccionado:

MÉTRICAS DE VENTAS Y FINANZAS:
- Facturación total: ${kpi_data.revenue.current:,.2f} (Variación vs período anterior: {kpi_data.revenue.growth_pct or 0}%)
- Total pedidos ingresados: {kpi_data.orders_count.current} (Completados: {kpi_data.completed_orders_count})
- Ticket promedio: ${kpi_data.average_ticket.current:,.2f}
- Tasa de rechazo/cancelación: {kpi_data.cancellation_rate.current}%
- Margen bruto promedio: {kpi_data.gross_margin_pct}% (Ganancia bruta: ${kpi_data.gross_profit.current:,.2f}, Costo insumos COGS: ${kpi_data.cogs.current:,.2f})
- Cumplimiento de meta: {kpi_data.goal.revenue_progress_pct if kpi_data.goal else 'N/A'}% de la meta de facturación.
- Platos estrella: {', '.join(f"{p.product_name} ({p.total_quantity}u, margen {p.margin_pct}%)" for p in kpi_data.top_products[:3]) or 'Sin ventas'}

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
            model_to_use = modelos.principal
            response = client.models.generate_content(
                model=model_to_use,
                contents=prompt,
            )
            raw_text = response.text or ""
            cleaned = raw_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()

            parsed = json.loads(cleaned)
            summary = parsed.get("summary") or "Rendimiento comercial y operativo evaluado correctamente."
            weaknesses = parsed.get("operational_weaknesses") or []
            recommendations = parsed.get("recommendations") or []
            highlights = parsed.get("highlights") or []

            if not recommendations:
                recommendations = ["Revisar márgenes y tiempos en las horas de mayor demanda."]
            if not weaknesses:
                weaknesses = ["No se detectaron cuellos de botella críticos en las comandas del período."]

            return StrategicInsightResponse(
                summary=summary,
                highlights=highlights,
                warnings=weaknesses,
                operational_weaknesses=weaknesses,
                recommendations=recommendations,
                operational_metrics=op_context,
                generated_at=now_dt,
            )
        except Exception as e:
            logger.warning("Fallo al consultar Gemini para insights comerciales: %s", e)

    # Fallback determinístico basado en reglas de negocio (sin depender de API externa o cuando falla)
    rev = kpi_data.revenue.current
    growth = kpi_data.revenue.growth_pct
    margin = kpi_data.gross_margin_pct
    ticket = kpi_data.average_ticket.current

    summary = (
        f"El negocio registró una facturación de ${rev:,.2f} ({kpi_data.completed_orders_count} pedidos finalizados) con un margen bruto promedio del {margin}%. "
        + (f"Las ventas reflejan una variación de {growth}% vs. el período anterior." if growth is not None else "El volumen de ventas se mantiene estable.")
    )

    highlights = [
        f"Ticket promedio situado en ${ticket:,.2f} por pedido finalizado.",
        f"Margen bruto comercial del {margin}% sobre los productos vendidos.",
    ]
    if kpi_data.top_products:
        top_prod = kpi_data.top_products[0]
        highlights.append(f"Plato más vendido: '{top_prod.product_name}' con {top_prod.total_quantity} unidades.")

    weaknesses = []
    if op_context.avg_wait_minutes >= 35.0 or op_context.max_wait_minutes >= 50:
        weaknesses.append(
            f"Demoras de preparación elevadas: promedio de {op_context.avg_wait_minutes} min (máximo de {op_context.max_wait_minutes} min), con {op_context.high_wait_count} pedidos superando los 45 minutos."
        )
    if op_context.peak_hour is not None and op_data.get("peak_hour_pct", 0) >= 30.0:
        weaknesses.append(
            f"Cuello de botella en hora pico: el {op_data.get('peak_hour_pct', 0)}% de las comandas se concentró a las {op_context.peak_hour:02d}:00 hs ({op_context.peak_hour_orders} pedidos), saturando la línea de despacho."
        )
    if kpi_data.cancellation_rate.current > 5.0:
        weaknesses.append(
            f"Tasa de rechazo o cancelación del {kpi_data.cancellation_rate.current}%, superando el umbral operativo tolerable del 5%."
        )
    if margin < 45.0 and rev > 0:
        weaknesses.append(
            f"Margen bruto comprimido ({margin}%): alto impacto del costo de insumos (${kpi_data.cogs.current:,.2f}) sobre el precio de venta."
        )
    if not weaknesses:
        weaknesses.append(
            f"Operación fluida con demora promedio de {op_context.avg_wait_minutes} min y tasa de rechazo controlada en {kpi_data.cancellation_rate.current}%."
        )

    recommendations = []
    if op_context.peak_hour is not None and op_data.get("peak_hour_pct", 0) >= 25.0:
        recommendations.append(
            f"Reforzar personal de cocina y pre-elaborar bases (mise en place) antes de las {op_context.peak_hour:02d}:00 hs para agilizar el pico de {op_context.peak_hour_orders} pedidos."
        )
    if op_context.avg_wait_minutes >= 35.0:
        recommendations.append(
            f"Ajustar los tiempos de demora estimada informados al cliente y limitar pedidos entrantes cuando la cocina supere los 40 minutos de demora."
        )
    if kpi_data.top_products:
        top_prod = kpi_data.top_products[0]
        recommendations.append(
            f"Crear combos de '{top_prod.product_name}' combinados con bebidas de alto margen para incrementar el ticket promedio actual de ${ticket:,.2f}."
        )
    if kpi_data.cancellation_rate.current > 5.0:
        recommendations.append(
            "Contactar a clientes con pedidos cancelados para evaluar si el motivo fue demora excesiva o falta de stock de ingredientes."
        )
    if kpi_data.goal and kpi_data.goal.revenue_progress_pct < 80:
        recommendations.append(
            f"Impulsar promociones por canal digital: faltan ${kpi_data.goal.revenue_remaining:,.2f} para alcanzar la meta comercial del período."
        )
    if not recommendations:
        recommendations.append("Mantener el ritmo de despacho actual y monitorear los costos de los insumos principales.")

    return StrategicInsightResponse(
        summary=summary,
        highlights=highlights,
        warnings=weaknesses,
        operational_weaknesses=weaknesses,
        recommendations=recommendations,
        operational_metrics=op_context,
        generated_at=now_dt,
    )
