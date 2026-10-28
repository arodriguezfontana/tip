from datetime import datetime

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.models.menu import Category, Product
from app.models.order import Order, OrderItem, OrderStatus
from app.repositories.common import created_between


def add(db: Session, order: Order) -> None:
    db.add(order)


def get_with_items(db: Session, order_id: int) -> Order | None:
    """Pedido con sus ítems y los productos de cada uno."""
    return (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product).joinedload(Product.category),
            joinedload(Order.delivery_driver),
        )
        .filter(Order.id == order_id)
        .first()
    )


def latest_for_chat(db: Session, channel: str, chat_id: str) -> Order | None:
    """Último pedido que hizo el cliente de ese chat (el más reciente, esté en el estado que esté)."""
    return (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product).joinedload(Product.category),
            joinedload(Order.delivery_driver),
        )
        .filter(Order.channel == channel, Order.chat_id == chat_id)
        .order_by(Order.id.desc())
        .first()
    )


def list_orders(
    db: Session,
    date_from: datetime | None,
    date_to: datetime | None,
    statuses: list[str] | None,
    sector: str | None = None,
) -> list[Order]:
    """Del más reciente al más antiguo."""
    query = created_between(
        db.query(Order).options(
            joinedload(Order.items).joinedload(OrderItem.product).joinedload(Product.category),
            joinedload(Order.delivery_driver),
        ),
        date_from,
        date_to,
    )
    if statuses:
        query = query.filter(Order.status.in_(statuses))
    if sector:
        sector_clean = sector.strip().lower()
        query = query.filter(
            Order.items.any(
                OrderItem.product.has(
                    or_(
                        func.lower(Product.sector) == sector_clean,
                        and_(
                            Product.sector.is_(None),
                            Product.category.has(func.lower(Category.sector) == sector_clean),
                        ),
                    )
                )
            )
        )
    return query.order_by(Order.created_at.desc()).all()


def count_with_status(db: Session, status: OrderStatus) -> int:
    return db.query(func.count(Order.id)).filter(Order.status == status.value).scalar() or 0


# --- Agregados para las estadísticas ------------------------------------------------------------------


def count_by_status(db: Session, date_from: datetime | None, date_to: datetime | None) -> list[tuple[str, int]]:
    query = created_between(db.query(Order.status, func.count(Order.id)), date_from, date_to)
    return query.group_by(Order.status).all()


def best_selling_products(
    db: Session, date_from: datetime | None, date_to: datetime | None, limit: int
) -> list[tuple[str, int, float]]:
    """(nombre, unidades, facturación) de los productos más vendidos en pedidos que cuentan como venta."""
    quantity = func.sum(OrderItem.quantity)
    query = created_between(
        db.query(Product.name, quantity, func.sum(OrderItem.quantity * OrderItem.unit_price))
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.is_billable),
        date_from,
        date_to,
    )
    return query.group_by(Product.id, Product.name).order_by(quantity.desc(), Product.name).limit(limit).all()


def billable_totals(db: Session, date_from: datetime | None, date_to: datetime | None) -> list[tuple[datetime, float]]:
    """(fecha de creación, total) de cada pedido que cuenta como venta."""
    query = created_between(db.query(Order.created_at, Order.total_amount).filter(Order.is_billable), date_from, date_to)
    return query.all()
