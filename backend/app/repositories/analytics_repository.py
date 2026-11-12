from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.business_goal import BusinessGoal
from app.models.menu import Product
from app.models.order import Order
from app.repositories.common import created_between

# --- Business Goals (Metas) --------------------------------------------------------------------------

def list_goals(db: Session) -> list[BusinessGoal]:
    return db.query(BusinessGoal).all()


def get_goal_by_period(db: Session, period_type: str) -> BusinessGoal | None:
    return db.query(BusinessGoal).filter(BusinessGoal.period_type == period_type).first()


def add_goal(db: Session, goal: BusinessGoal) -> None:
    db.add(goal)


# --- Métricas y KPIs de pedidos -----------------------------------------------------------------------


def order_counts_by_status(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> dict[str, int]:
    query = created_between(db.query(Order.status, func.count(Order.id)), date_from, date_to)
    return dict(query.group_by(Order.status).all())


def billable_revenue_and_count(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> tuple[float, int]:
    """(total facturado, cantidad de pedidos facturables) del período."""
    query = created_between(
        db.query(func.coalesce(func.sum(Order.total_amount), 0), func.count(Order.id)).filter(Order.is_billable),
        date_from,
        date_to,
    )
    rev, count = query.one()
    return float(rev or 0), int(count or 0)


def products_with_recipe(db: Session, product_names: list[str]) -> list[Product]:
    """Productos con esos nombres (con su receta e ingredientes a mano)."""
    return db.query(Product).filter(Product.name.in_(product_names)).all()


def order_summaries(db: Session, date_from: datetime | None, date_to: datetime | None) -> list[Any]:
    """De cada pedido del período: id, demora estimada, forma de entrega, origen, fecha de creación y estado."""
    return created_between(
        db.query(
            Order.id,
            Order.estimated_minutes,
            Order.delivery_method,
            Order.source,
            Order.created_at,
            Order.status,
        ),
        date_from,
        date_to,
    ).all()
