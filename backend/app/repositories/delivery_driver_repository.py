from sqlalchemy.orm import Session

from app.models.delivery_driver import DeliveryDriver


def add(db: Session, driver: DeliveryDriver) -> None:
    db.add(driver)


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

