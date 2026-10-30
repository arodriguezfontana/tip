"""Servicio de gestión de promociones."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.db.session import transaction
from app.models.promotion import Promotion, PromotionPhoto
from app.repositories import product_repository, promotion_repository
from app.schemas.promotion_schemas import PromotionItemPayload


def list_promotions(db: Session) -> list[Promotion]:
    return promotion_repository.list_all(db)


def list_available_promotions(db: Session) -> list[Promotion]:
    return promotion_repository.list_available(db)


def get_required_promotion(db: Session, promotion_id: int) -> Promotion:
    promo = promotion_repository.get(db, promotion_id)
    if promo is None:
        raise NotFoundError("La promoción no existe.")
    return promo


def _validate_items(db: Session, items: list[PromotionItemPayload]) -> list[tuple]:
    if not items:
        raise BusinessRuleError("La promoción debe incluir al menos un producto.")
    product_ids = {it.product_id for it in items}
    products = product_repository.get_many(db, product_ids)
    if len(products) != len(product_ids):
        raise BusinessRuleError("Algunos de los productos seleccionados no existen.")
    result = []
    seen = set()
    for it in items:
        if it.product_id in seen:
            raise BusinessRuleError("Un producto figura más de una vez en la promoción.")
        seen.add(it.product_id)
        if it.quantity < 1:
            raise BusinessRuleError("Las cantidades de los productos deben ser mayores a cero.")
        result.append((products[it.product_id], it.quantity))
    return result


def create_promotion(
    db: Session,
    name: str,
    description: str | None,
    price: float | Decimal,
    is_active: bool,
    items: list[PromotionItemPayload],
    image_url: str | None = None,
) -> Promotion:
    if promotion_repository.name_taken(db, name):
        raise ConflictError(f"Ya existe una promoción con el nombre '{name}'.")
    if price <= 0:
        raise BusinessRuleError("El precio de la promoción debe ser mayor a cero.")

    product_lines = _validate_items(db, items)

    with transaction(db):
        promo = Promotion(
            name=name,
            description=description,
            price=price,
            is_active=is_active,
            image_url=image_url,
        )
        promo.set_products(product_lines)
        promotion_repository.add(db, promo)

    db.refresh(promo)
    return get_required_promotion(db, promo.id)


def update_promotion(
    db: Session,
    promotion_id: int,
    name: str,
    description: str | None,
    price: float | Decimal,
    is_active: bool,
    items: list[PromotionItemPayload],
    image_url: str | None = None,
) -> Promotion:
    promo = get_required_promotion(db, promotion_id)
    if promotion_repository.name_taken(db, name, exclude_id=promotion_id):
        raise ConflictError(f"Ya existe una promoción con el nombre '{name}'.")
    if price <= 0:
        raise BusinessRuleError("El precio de la promoción debe ser mayor a cero.")

    product_lines = _validate_items(db, items)

    with transaction(db):
        promo.name = name
        promo.description = description
        promo.price = price
        promo.is_active = is_active
        promo.image_url = image_url
        promo.set_products(product_lines)

    db.refresh(promo)
    return get_required_promotion(db, promo.id)


def delete_promotion(db: Session, promotion_id: int) -> None:
    promo = get_required_promotion(db, promotion_id)
    with transaction(db):
        promotion_repository.delete(db, promo)


def set_promotion_image(db: Session, promotion_id: int, data: bytes) -> Promotion:
    promo = get_required_promotion(db, promotion_id)
    with transaction(db):
        promo.replace_image(data, now=datetime.now(timezone.utc))
    db.refresh(promo)
    return get_required_promotion(db, promotion_id)


def delete_promotion_image(db: Session, promotion_id: int) -> Promotion:
    promo = get_required_promotion(db, promotion_id)
    with transaction(db):
        promo.remove_image()
    db.refresh(promo)
    return get_required_promotion(db, promotion_id)


def get_promotion_image(db: Session, promotion_id: int) -> PromotionPhoto:
    promo = get_required_promotion(db, promotion_id)
    if promo.photo is None:
        raise NotFoundError("La promoción no tiene imagen cargada.")
    return promo.photo


