from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased, joinedload

from app.models.menu import Category, Product
from app.models.order import Order, OrderItem, OrderStatus, OrderStatusEvent, PaymentMethod
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


def get(db: Session, order_id: int) -> Order | None:
    return db.query(Order).filter(Order.id == order_id).first()


def find_by_mercadopago_id(db: Session, mercadopago_id: str) -> Order | None:
    """Pedido cuya preferencia o pago de MercadoPago tiene ese id."""
    return (
        db.query(Order)
        .filter((Order.mp_preference_id == mercadopago_id) | (Order.mp_payment_id == mercadopago_id))
        .first()
    )


def awaiting_mercadopago_payment(db: Session, statuses: list[str], limit: int) -> list[Order]:
    """Pedidos con un cobro de MercadoPago generado y todavía sin abonar, del más nuevo al más viejo."""
    return (
        db.query(Order)
        .filter(
            or_(
                Order.payment_method == PaymentMethod.MERCADOPAGO.value,
                Order.balance_payment_method == PaymentMethod.MERCADOPAGO.value,
            ),
            Order.is_paid.is_(False),
            Order.mp_preference_id.isnot(None),
            Order.status.in_(statuses),
        )
        .order_by(Order.id.desc())
        .limit(limit)
        .all()
    )


def mark_paid_if_unpaid(
    db: Session, order_id: int, is_balance: bool, mercadopago_payment_id: str | None, payment_method: str | None
) -> bool:
    """Marca el pedido como abonado solo si todavía no lo está (UPDATE condicional, sin confirmar).

    Con `is_balance` salda la diferencia de un pedido con pago parcial; si no, el primer pago. Devuelve False si
    no cambió nada: el aviso era repetido o corresponde al otro pago.
    """
    values: dict = {Order.is_paid: True}
    if payment_method:
        values[Order.payment_method] = payment_method
    if mercadopago_payment_id:
        values[Order.mp_payment_id] = mercadopago_payment_id
    payment_is_due = Order.paid_amount > 0 if is_balance else Order.paid_amount == 0
    updated = (
        db.query(Order)
        .filter(Order.id == order_id, Order.is_paid.is_(False), payment_is_due)
        .update(values, synchronize_session=False)
    )
    return updated > 0


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


def best_selling_promotions(
    db: Session, date_from: datetime | None, date_to: datetime | None, limit: int = 5
) -> list[tuple[str, int, float]]:
    """(nombre, unidades, facturación) de las promociones más vendidas en pedidos que cuentan como venta."""
    from app.models.promotion import Promotion

    quantity = func.sum(OrderItem.quantity)
    revenue = func.sum(OrderItem.quantity * OrderItem.unit_price)
    query = created_between(
        db.query(Promotion.name, quantity, revenue)
        .join(OrderItem, OrderItem.promotion_id == Promotion.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.is_billable),
        date_from,
        date_to,
    )
    return query.group_by(Promotion.id, Promotion.name).order_by(quantity.desc(), Promotion.name).limit(limit).all()


def billable_totals(db: Session, date_from: datetime | None, date_to: datetime | None) -> list[tuple[datetime, Decimal]]:
    """(fecha de creación, total) de cada pedido que cuenta como venta."""
    query = created_between(db.query(Order.created_at, Order.total_amount).filter(Order.is_billable), date_from, date_to)
    return query.all()
