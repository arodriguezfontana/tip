from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, require_admin_pin
from app.db.session import get_db
from app.schemas.analytics_schemas import (
    BusinessGoalItem,
    BusinessGoalsResponse,
    DashboardKPIsResponse,
    StrategicInsightResponse,
    UpdateBusinessGoalsPayload,
)
from app.schemas.ingredient_schemas import IngredientConsumptionResponse
from app.schemas.stats_schemas import BestSellingDayResponse, StatusDistributionResponse, TopProductResponse
from app.services import analytics_service, stats_service
from app.services.ingredient_service import ingredient_consumption

router = APIRouter(dependencies=[Depends(require_admin_pin)])


def _goals_response(goals: list[analytics_service.BusinessGoalData]) -> BusinessGoalsResponse:
    return BusinessGoalsResponse(goals=[BusinessGoalItem.model_validate(goal) for goal in goals])


# --- Endpoints Clásicos (Retrocompatibilidad) ---------------------------------------------------------


@router.get(
    "/status-distribution",
    dependencies=[Depends(get_current_admin)],
)
def get_status_distribution(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
) -> StatusDistributionResponse:
    """Cantidad de pedidos del período en cada estado."""
    return StatusDistributionResponse(status_distribution=stats_service.status_distribution(db, date_from, date_to))


@router.get("/top-products", dependencies=[Depends(get_current_admin)])
def get_top_products(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[TopProductResponse]:
    """Productos más vendidos del período, sin contar los pedidos rechazados."""
    return [TopProductResponse.from_stat(stat) for stat in stats_service.top_products(db, date_from, date_to, limit)]


@router.get("/best-selling-day", dependencies=[Depends(get_current_admin)])
def get_best_selling_day(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
) -> BestSellingDayResponse:
    """Día de la semana con mayor facturación del período."""
    return BestSellingDayResponse.from_stat(stats_service.best_selling_day(db, date_from, date_to))


@router.get(
    "/ingredient-consumption",
    dependencies=[Depends(get_current_admin)],
)
def get_ingredient_consumption(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    ingredient_id: int | None = Query(None, description="Muestra solo el consumo de este ingrediente."),
    db: Session = Depends(get_db),
) -> IngredientConsumptionResponse:
    """Total de cada ingrediente usado en los pedidos finalizados del período, según las recetas."""
    return IngredientConsumptionResponse.from_report(ingredient_consumption(db, date_from, date_to, ingredient_id))


# --- US-49: Dashboard de Metas de Negocio y Rendimiento Comercial ------------------------------------


@router.get("/kpis", dependencies=[Depends(get_current_admin)])
def get_dashboard_kpis(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
) -> DashboardKPIsResponse:
    """Calcula métricas clave avanzadas (ticket promedio, tasa de rechazo, margen bruto y costos,

    crecimiento porcentual vs. período previo y seguimiento de metas).
    """
    return DashboardKPIsResponse.model_validate(analytics_service.calculate_dashboard_kpis(db, date_from, date_to))


@router.get("/goals", dependencies=[Depends(get_current_admin)])
def get_goals(
    db: Session = Depends(get_db),
) -> BusinessGoalsResponse:
    """Obtiene las metas comerciales configuradas para los diferentes períodos."""
    return _goals_response(analytics_service.get_business_goals(db))


@router.put("/goals", dependencies=[Depends(get_current_admin)])
def put_goals(
    payload: UpdateBusinessGoalsPayload,
    db: Session = Depends(get_db),
) -> BusinessGoalsResponse:
    """Establece o actualiza las metas cuantitativas del negocio."""
    goals = [
        analytics_service.BusinessGoalData(g.period_type, g.target_revenue, g.target_orders) for g in payload.goals
    ]
    return _goals_response(analytics_service.update_business_goals(db, goals))


@router.get("/strategic-insight", dependencies=[Depends(get_current_admin)])
def get_strategic_insight(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
) -> StrategicInsightResponse:
    """Genera un análisis e informe ejecutivo inteligente asistido por IA / BI sobre las métricas comerciales."""
    kpis = analytics_service.calculate_dashboard_kpis(db, date_from, date_to)
    insight = analytics_service.generate_strategic_insight(kpis, db=db, date_from=date_from, date_to=date_to)
    return StrategicInsightResponse.model_validate(insight)
