from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, require_admin_pin
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics_schemas import (
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


# --- Endpoints Clásicos (Retrocompatibilidad) ---------------------------------------------------------


@router.get("/status-distribution", response_model=StatusDistributionResponse)
def get_status_distribution(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> StatusDistributionResponse:
    """Cantidad de pedidos del período en cada estado."""
    return StatusDistributionResponse(status_distribution=stats_service.status_distribution(db, date_from, date_to))


@router.get("/top-products", response_model=list[TopProductResponse])
def get_top_products(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[TopProductResponse]:
    """Productos más vendidos del período, sin contar los pedidos rechazados."""
    return [TopProductResponse.from_stat(stat) for stat in stats_service.top_products(db, date_from, date_to, limit)]


@router.get("/best-selling-day", response_model=BestSellingDayResponse)
def get_best_selling_day(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> BestSellingDayResponse:
    """Día de la semana con mayor facturación del período."""
    return BestSellingDayResponse.from_stat(stats_service.best_selling_day(db, date_from, date_to))


@router.get("/ingredient-consumption", response_model=IngredientConsumptionResponse)
def get_ingredient_consumption(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    ingredient_id: int | None = Query(None, description="Muestra solo el consumo de este ingrediente."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> IngredientConsumptionResponse:
    """Total de cada ingrediente usado en los pedidos finalizados del período, según las recetas."""
    return IngredientConsumptionResponse.from_report(ingredient_consumption(db, date_from, date_to, ingredient_id))


# --- US-49: Dashboard de Metas de Negocio y Rendimiento Comercial ------------------------------------


@router.get("/kpis", response_model=DashboardKPIsResponse)
def get_dashboard_kpis(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> DashboardKPIsResponse:
    """Calcula métricas clave avanzadas (ticket promedio, tasa de rechazo, margen bruto y costos,

    crecimiento porcentual vs. período previo y seguimiento de metas).
    """
    return analytics_service.calculate_dashboard_kpis(db, date_from, date_to)


@router.get("/goals", response_model=BusinessGoalsResponse)
def get_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> BusinessGoalsResponse:
    """Obtiene las metas comerciales configuradas para los diferentes períodos."""
    return analytics_service.get_business_goals(db)


@router.put("/goals", response_model=BusinessGoalsResponse)
def put_goals(
    payload: UpdateBusinessGoalsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> BusinessGoalsResponse:
    """Establece o actualiza las metas cuantitativas del negocio."""
    return analytics_service.update_business_goals(db, payload)


@router.get("/strategic-insight", response_model=StrategicInsightResponse)
def get_strategic_insight(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> StrategicInsightResponse:
    """Genera un análisis e informe ejecutivo inteligente asistido por IA / BI sobre las métricas comerciales."""
    kpis = analytics_service.calculate_dashboard_kpis(db, date_from, date_to)
    return analytics_service.generate_strategic_insight(kpis)
