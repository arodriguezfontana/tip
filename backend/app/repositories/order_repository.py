from datetime import datetime

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased, joinedload

from app.models.menu import Category, Product
from app.models.order import Order, OrderItem, OrderStatus, OrderStatusEvent
from app.models.promotion import Promotion, PromotionProduct
from app.repositories.common import created_between


def _order_item_options():
    return (
        joinedload(Order.items).joinedload(OrderItem.product).joinedload(Product.category),
        joinedload(Order.items)
        .joinedload(OrderItem.promotion)
        .joinedload(Promotion.items)
        .joinedload(PromotionProduct.product)
        .joinedload(Product.category),
        joinedload(Order.delivery_driver),
    )


def add(db: Session, order: Order) -> None:
    db.add(order)


def get_with_items(db: Session, order_id: int) -> Order | None:
    """Pedido con sus ítems y los productos de cada uno."""
    return (
        db.query(Order)
        .options(*_order_item_options())
        .filter(Order.id == order_id)
        .first()
    )


def latest_for_chat(db: Session, channel: str, chat_id: str) -> Order | None:
    """Último pedido que hizo el cliente de ese chat (el más reciente, esté en el estado que esté)."""
    return (
        db.query(Order)
        .options(*_order_item_options())
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
        db.query(Order).options(*_order_item_options()),
        date_from,
        date_to,
    )
    if statuses:
        query = query.filter(Order.status.in_(statuses))
    if sector:
        sector_clean = sector.strip().lower()
        query = query.filter(
            Order.items.any(
                or_(
                    OrderItem.product.has(
                        or_(
                            func.lower(Product.sector) == sector_clean,
                            and_(
                                Product.sector.is_(None),
                                Product.category.has(func.lower(Category.sector) == sector_clean),
                            ),
                        )
                    ),
                    OrderItem.promotion.has(
                        Promotion.items.any(
                            PromotionProduct.product.has(
                                or_(
                                    func.lower(Product.sector) == sector_clean,
                                    and_(
                                        Product.sector.is_(None),
                                        Product.category.has(func.lower(Category.sector) == sector_clean),
                                    ),
                                )
                            )
                        )
                    ),
                )
            )
        )
    return query.order_by(Order.created_at.desc()).all()


def count_with_status(db: Session, status: OrderStatus) -> int:
    return db.query(func.count(Order.id)).filter(Order.status == status.value).scalar() or 0


def undispatched_for_driver(db: Session, delivery_driver_id: int) -> list[Order]:
    """Pedidos a domicilio en camino de un repartidor que todavía no salieron de viaje, del más viejo al más nuevo."""
    return (
        db.query(Order)
        .options(*_order_item_options())
        .filter(
            Order.status == OrderStatus.ON_THE_WAY.value,
            Order.delivery_method == "domicilio",
            Order.delivery_driver_id == delivery_driver_id,
            Order.trip_id.is_(None),
        )
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )


def finished_durations(db: Session, delivery_method: str, queue_size: int, limit: int) -> list[int]:
    """Demora real (minutos desde que ingresó hasta que se finalizó) de los últimos pedidos para ahora con ese método de
    entrega que se aceptaron con esa cantidad de pedidos en cola. Los más recientes primero."""
    accepted = aliased(OrderStatusEvent)
    rows = (
        db.query(Order.actual_minutes)
        .join(accepted, accepted.order_id == Order.id)
        .filter(
            accepted.status == OrderStatus.CONFIRMED.value,
            accepted.queue_size == queue_size,
            Order.status == OrderStatus.COMPLETED.value,
            Order.actual_minutes.isnot(None),
            Order.delivery_method == delivery_method,
            Order.scheduled_for.is_(None),
        )
        .order_by(Order.id.desc())
        .limit(limit)
        .all()
    )
    return [minutes for (minutes,) in rows]


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
