import logging

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, NotFoundError
from app.db.session import transaction
from app.models.delivery_driver import DeliveryDriver
from app.repositories import delivery_driver_repository

logger = logging.getLogger(__name__)


def create_delivery_driver(
    db: Session, name: str, phone: str, is_active: bool = True
) -> DeliveryDriver:
    clean_name = (name or "").strip()
    if not clean_name:
        raise BusinessRuleError("El nombre del repartidor es obligatorio.")
    clean_phone = (phone or "").strip()
    if not clean_phone:
        raise BusinessRuleError("El teléfono del repartidor es obligatorio.")
    driver = DeliveryDriver(name=clean_name, phone=clean_phone, is_active=is_active)
    with transaction(db):
        delivery_driver_repository.add(db, driver)
    db.refresh(driver)
    return driver


def update_delivery_driver(
    db: Session, driver_id: int, name: str, phone: str, is_active: bool
) -> DeliveryDriver:
    driver = delivery_driver_repository.get(db, driver_id)
    if driver is None:
        raise NotFoundError("Repartidor no encontrado.")
    clean_name = (name or "").strip()
    if not clean_name:
        raise BusinessRuleError("El nombre del repartidor es obligatorio.")
    clean_phone = (phone or "").strip()
    if not clean_phone:
        raise BusinessRuleError("El teléfono del repartidor es obligatorio.")
    with transaction(db):
        driver.name = clean_name
        driver.phone = clean_phone
        driver.is_active = is_active
    db.refresh(driver)
    return driver


def list_delivery_drivers(
    db: Session, active_only: bool = False, search: str | None = None
) -> list[DeliveryDriver]:
    return delivery_driver_repository.list_drivers(db, active_only=active_only, search=search)


def get_delivery_driver(db: Session, driver_id: int) -> DeliveryDriver:
    driver = delivery_driver_repository.get(db, driver_id)
    if driver is None:
        raise NotFoundError("Repartidor no encontrado.")
    return driver
