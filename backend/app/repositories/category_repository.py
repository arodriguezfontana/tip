from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.modules.menu import Category
from app.repositories.common import name_taken as _name_taken


def add(db: Session, category: Category) -> None:
    db.add(category)


def delete(db: Session, category: Category) -> None:
    db.delete(category)


def get(db: Session, category_id: int) -> Category | None:
    return db.get(Category, category_id)


def name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    return _name_taken(db, Category, name, exclude_id)


def list_with_products(db: Session) -> list[Category]:
    """Ordenadas por nombre."""
    return db.query(Category).options(selectinload(Category.products)).order_by(func.lower(Category.name)).all()


def get_with_products(db: Session, category_id: int) -> Category | None:
    db.expire_all()
    return db.query(Category).options(selectinload(Category.products)).filter(Category.id == category_id).first()
