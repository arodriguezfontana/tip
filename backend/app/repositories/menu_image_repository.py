from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.menu_image import MenuImage


def list_images(db: Session) -> list[MenuImage]:
    """Del primero al último en el orden en que se mandan. Los bytes se traen recién al usarlos."""
    return list(db.scalars(select(MenuImage).order_by(MenuImage.position, MenuImage.id)))


def get(db: Session, image_id: int) -> MenuImage | None:
    return db.get(MenuImage, image_id)


def count(db: Session) -> int:
    return db.scalar(select(func.count(MenuImage.id))) or 0


def last_position(db: Session) -> int | None:
    return db.scalar(select(func.max(MenuImage.position)))


def add(db: Session, image: MenuImage) -> None:
    db.add(image)


def delete(db: Session, image: MenuImage) -> None:
    db.delete(image)
