from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.delivery_driver import DeliveryDriver
from app.models.order import OrderStatus
from app.repositories import driver_review_repository
from app.schemas.delivery_driver_schemas import (
    DeliveryDriverCreate,
    DeliveryDriverResponse,
    DeliveryDriverUpdate,
    DriverActivityResponse,
    DriverReviewResponse,
    DriverReviewsDetailResponse,
)
from app.services import delivery_driver_service, driver_activity_service

router = APIRouter()


@router.post(
    "",
    response_model=DeliveryDriverResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
def create_delivery_driver(
    payload: DeliveryDriverCreate,
    db: Session = Depends(get_db),
) -> DeliveryDriver:
    """Registra un nuevo repartidor en el sistema."""
    return delivery_driver_service.create_delivery_driver(
        db, name=payload.name, phone=payload.phone, is_active=payload.is_active
    )


@router.get("", response_model=list[DeliveryDriverResponse], dependencies=[Depends(get_current_admin)])
def list_delivery_drivers(
    active_only: bool = Query(False, description="Filtra solo los repartidores activos."),
    search: str | None = Query(None, description="Búsqueda por nombre o teléfono."),
    db: Session = Depends(get_db),
) -> list[DeliveryDriverResponse]:
    """Lista todos los repartidores registrados con sus métricas de calificación."""
    drivers = delivery_driver_service.list_delivery_drivers(
        db, active_only=active_only, search=search
    )
    stats_by_driver = driver_review_repository.get_all_drivers_rating_stats(db)
    result = []
    for d in drivers:
        stats = stats_by_driver.get(d.id, (None, 0, 0))
        resp = DeliveryDriverResponse.model_validate(d)
        resp.rating_average = stats[0]
        resp.ratings_count = stats[1]
        resp.reviews_count = stats[2]
        result.append(resp)
    return result


@router.get("/{driver_id}", response_model=DeliveryDriverResponse, dependencies=[Depends(get_current_admin)])
def get_delivery_driver(
    driver_id: int,
    db: Session = Depends(get_db),
) -> DeliveryDriverResponse:
    """Obtiene el detalle de un repartidor."""
    driver = delivery_driver_service.get_delivery_driver(db, driver_id)
    avg_r, count_r, count_total = driver_review_repository.get_driver_rating_stats(db, driver_id)
    resp = DeliveryDriverResponse.model_validate(driver)
    resp.rating_average = avg_r
    resp.ratings_count = count_r
    resp.reviews_count = count_total
    return resp


@router.get(
    "/{driver_id}/reviews",
    response_model=DriverReviewsDetailResponse,
    dependencies=[Depends(get_current_admin)],
)
def get_driver_reviews(
    driver_id: int,
    db: Session = Depends(get_db),
) -> DriverReviewsDetailResponse:
    """Obtiene las reseñas anónimas recibidas por el repartidor y el resumen de entregas y puntaje."""
    driver = delivery_driver_service.get_delivery_driver(db, driver_id)
    avg_r, count_r, count_total = driver_review_repository.get_driver_rating_stats(db, driver_id)
    reviews = driver_review_repository.get_driver_reviews(db, driver_id)
    delivered_count = sum(
        1 for o in driver.orders if o.status == OrderStatus.COMPLETED.value
    )
    return DriverReviewsDetailResponse(
        driver_id=driver.id,
        driver_name=driver.name,
        delivered_orders_count=delivered_count,
        rating_average=avg_r,
        ratings_count=count_r,
        reviews_count=count_total,
        reviews=[DriverReviewResponse.model_validate(r) for r in reviews],
    )


@router.get(
    "/{driver_id}/trips", response_model=DriverActivityResponse, dependencies=[Depends(get_current_admin)]
)
def get_driver_activity(
    driver_id: int,
    date_from: datetime | None = Query(None, description="Salida mínima (inclusive) de los viajes."),
    date_to: datetime | None = Query(None, description="Salida máxima (inclusive) de los viajes."),
    current_shift: bool = Query(False, description="Solo los viajes del turno de caja abierto."),
    db: Session = Depends(get_db),
) -> DriverActivityResponse:
    """Historial de viajes del repartidor con sus pedidos, y el resumen del período (efectivo a rendir incluido)."""
    activity = driver_activity_service.get_driver_activity(db, driver_id, date_from, date_to, current_shift)
    return DriverActivityResponse.model_validate(activity)


@router.put("/{driver_id}", response_model=DeliveryDriverResponse, dependencies=[Depends(get_current_admin)])
def update_delivery_driver(
    driver_id: int,
    payload: DeliveryDriverUpdate,
    db: Session = Depends(get_db),
) -> DeliveryDriver:
    """Modifica los datos de un repartidor (nombre, teléfono o estado activo)."""
    return delivery_driver_service.update_delivery_driver(
        db,
        driver_id=driver_id,
        name=payload.name,
        phone=payload.phone,
        is_active=payload.is_active,
    )
