from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.delivery_driver import DeliveryDriver
from app.models.user import User
from app.schemas.delivery_driver_schemas import (
    DeliveryDriverCreate,
    DeliveryDriverResponse,
    DeliveryDriverUpdate,
)
from app.services import delivery_driver_service

router = APIRouter()


@router.post("", response_model=DeliveryDriverResponse, status_code=status.HTTP_201_CREATED)
def create_delivery_driver(
    payload: DeliveryDriverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> DeliveryDriver:
    """Registra un nuevo repartidor en el sistema."""
    return delivery_driver_service.create_delivery_driver(
        db, name=payload.name, phone=payload.phone, is_active=payload.is_active
    )


@router.get("", response_model=list[DeliveryDriverResponse])
def list_delivery_drivers(
    active_only: bool = Query(False, description="Filtra solo los repartidores activos."),
    search: str | None = Query(None, description="Búsqueda por nombre o teléfono."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[DeliveryDriver]:
    """Lista todos los repartidores registrados."""
    return delivery_driver_service.list_delivery_drivers(
        db, active_only=active_only, search=search
    )


@router.get("/{driver_id}", response_model=DeliveryDriverResponse)
def get_delivery_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> DeliveryDriver:
    """Obtiene el detalle de un repartidor."""
    return delivery_driver_service.get_delivery_driver(db, driver_id)


@router.put("/{driver_id}", response_model=DeliveryDriverResponse)
def update_delivery_driver(
    driver_id: int,
    payload: DeliveryDriverUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> DeliveryDriver:
    """Modifica los datos de un repartidor (nombre, teléfono o estado activo)."""
    return delivery_driver_service.update_delivery_driver(
        db,
        driver_id=driver_id,
        name=payload.name,
        phone=payload.phone,
        is_active=payload.is_active,
    )

