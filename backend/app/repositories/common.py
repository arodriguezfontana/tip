from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.models.order import Order


def name_taken(db: Session, model, name: str, exclude_id: int | None = None) -> bool:
    """Si ya existe otra fila de `model` con ese nombre, sin distinguir mayúsculas."""
    query = db.query(model.id).filter(func.lower(model.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(model.id != exclude_id)
    return query.first() is not None


def created_between(query: Query, date_from: datetime | None, date_to: datetime | None) -> Query:
    """Filtra por la fecha de creación del pedido (ambos extremos inclusive)."""
    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)
    return query
