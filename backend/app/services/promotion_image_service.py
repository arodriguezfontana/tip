"""Imágenes de promociones del local: las carga el dueño desde el panel y el bot se las manda a los clientes."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, NotFoundError
from app.db.session import transaction
from app.models.promotion import MAX_PROMOTION_IMAGES, PromotionImage
from app.repositories import promotion_repository


def list_promotion_images(db: Session) -> list[PromotionImage]:
    return promotion_repository.list_promotion_images(db)


def get_required_promotion_image(db: Session, image_id: int) -> PromotionImage:
    image = promotion_repository.get_promotion_image(db, image_id)
    if image is None:
        raise NotFoundError("La imagen de la promoción no existe")
    return image


def add_promotion_image(db: Session, data: bytes) -> PromotionImage:
    with transaction(db):
        if db.scalar(select(func.count(PromotionImage.id))) >= MAX_PROMOTION_IMAGES:
            raise BusinessRuleError(f"Se admiten hasta {MAX_PROMOTION_IMAGES} imágenes de promociones.")
        last_position = db.scalar(select(func.max(PromotionImage.position)))
        image = PromotionImage(position=0 if last_position is None else last_position + 1)
        image.replace(data, now=datetime.now(timezone.utc))
        promotion_repository.add_promotion_image(db, image)
    db.refresh(image)
    return image


def replace_promotion_image(db: Session, image_id: int, data: bytes) -> PromotionImage:
    with transaction(db):
        image = get_required_promotion_image(db, image_id)
        image.replace(data, now=datetime.now(timezone.utc))
    db.refresh(image)
    return image


def delete_promotion_image(db: Session, image_id: int) -> None:
    with transaction(db):
        promotion_repository.delete_promotion_image(db, get_required_promotion_image(db, image_id))


def reorder_promotion_images(db: Session, ids: list[int]) -> None:
    with transaction(db):
        images = {image.id: image for image in list_promotion_images(db)}
        if sorted(ids) != sorted(images):
            raise BusinessRuleError("El nuevo orden tiene que incluir cada imagen de promociones una sola vez.")
        for position, image_id in enumerate(ids):
            images[image_id].position = position

