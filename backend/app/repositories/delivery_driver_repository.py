from datetime import datetime

from sqlalchemy.orm import Session, selectinload

from app.models.delivery_driver import DeliveryDriver, DeliveryTrip
from app.models.order import Order


def add(db: Session, driver: DeliveryDriver) -> None:
    db.add(driver)


def add_trip(db: Session, trip: DeliveryTrip) -> None:
    """Registra el viaje y le asigna su id (sin confirmar la transacción)."""
    db.add(trip)
    db.flush()


def get(db: Session, driver_id: int) -> DeliveryDriver | None:
    return db.get(DeliveryDriver, driver_id)


def list_drivers(
    db: Session, active_only: bool = False, search: str | None = None
) -> list[DeliveryDriver]:
    query = db.query(DeliveryDriver)
    if active_only:
        query = query.filter(DeliveryDriver.is_active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            DeliveryDriver.name.ilike(term) | DeliveryDriver.phone.ilike(term)
        )
    return query.order_by(DeliveryDriver.is_active.desc(), DeliveryDriver.name.asc()).all()


def trips_dispatched_between(
    db: Session, driver_id: int, date_from: datetime | None, date_to: datetime | None
) -> list[DeliveryTrip]:
    """Viajes del repartidor que salieron en el período (extremos inclusive), del más reciente al más antiguo."""
    query = (
        db.query(DeliveryTrip)
        .options(selectinload(DeliveryTrip.orders).selectinload(Order.status_events))
        .filter(DeliveryTrip.delivery_driver_id == driver_id)
    )
    if date_from is not None:
        query = query.filter(DeliveryTrip.dispatched_at >= date_from)
    if date_to is not None:
        query = query.filter(DeliveryTrip.dispatched_at <= date_to)
    return query.order_by(DeliveryTrip.dispatched_at.desc(), DeliveryTrip.id.desc()).all()
