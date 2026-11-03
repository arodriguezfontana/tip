"""Imágenes del menú del local: las carga el dueño desde el panel y el bot se las manda a los clientes."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, NotFoundError
from app.db.session import transaction
from app.models.menu_image import MAX_MENU_IMAGES, MenuImage


def list_menu_images(db: Session) -> list[MenuImage]:
    """Las imágenes del menú en el orden en que se mandan. Los bytes se traen recién al usarlos."""
    return list(db.scalars(select(MenuImage).order_by(MenuImage.position, MenuImage.id)))


def get_required_menu_image(db: Session, image_id: int) -> MenuImage:
    image = db.get(MenuImage, image_id)
    if image is None:
        raise NotFoundError("La imagen del menú no existe")
    return image


def add_menu_image(db: Session, data: bytes) -> MenuImage:
    """Suma una imagen al final del menú. Valida el formato y el peso (ver MenuImage.replace)."""
    with transaction(db):
        if db.scalar(select(func.count(MenuImage.id))) >= MAX_MENU_IMAGES:
            raise BusinessRuleError(f"El menú admite hasta {MAX_MENU_IMAGES} imágenes.")
        last_position = db.scalar(select(func.max(MenuImage.position)))
        image = MenuImage(position=0 if last_position is None else last_position + 1)
        image.replace(data, now=datetime.now(timezone.utc))
        db.add(image)
    db.refresh(image)
    return image


def replace_menu_image(db: Session, image_id: int, data: bytes) -> MenuImage:
    """Cambia el contenido de una imagen sin moverla de lugar: el bot manda la nueva desde que se guarda."""
    with transaction(db):
        image = get_required_menu_image(db, image_id)
        image.replace(data, now=datetime.now(timezone.utc))
    db.refresh(image)
    return image


def delete_menu_image(db: Session, image_id: int) -> None:
    with transaction(db):
        db.delete(get_required_menu_image(db, image_id))


def reorder_menu_images(db: Session, ids: list[int]) -> None:
    """Deja las imágenes en el orden indicado; tienen que estar todas, una sola vez."""
    with transaction(db):
        images = {image.id: image for image in list_menu_images(db)}
        if sorted(ids) != sorted(images):
            raise BusinessRuleError("El nuevo orden tiene que incluir cada imagen del menú una sola vez.")
        for position, image_id in enumerate(ids):
            images[image_id].position = position
