"""Casos de uso de los pedidos: registrarlos desde cada canal (web, mostrador y bot), consultarlos y
avanzarlos en su ciclo de vida. Las reglas del pedido en sí viven en el modelo Order."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.core.errors import BusinessRuleError, NotFoundError
from app.db.session import commit
from app.modules.menu import Product
from app.modules.order import DeliveryMethod, InvalidOrderError, Order, OrderItem, OrderSource, OrderStatus
from app.modules.user import User
from app.services.client_service import upsert_client

logger = logging.getLogger(__name__)

# Demora estimada de un pedido nuevo: una base más un tanto por cada pedido que se está preparando.
BASE_DELAY_MINUTES = 15
MINUTES_PER_ORDER_IN_PROGRESS = 3


@dataclass(frozen=True)
class OrderRequest:
    """Datos de un pedido nuevo, sea cual sea el canal por el que llegó."""

    customer_name: str
    customer_phone: str
    delivery_method: DeliveryMethod | str
    shipping_address: str | None
    notes: str | None
    # (product_id, cantidad). Puede repetir productos: se suman.
    items: list[tuple[int, int]]


@dataclass(frozen=True)
class CounterPayment:
    method: str | None
    is_paid: bool


class ScheduleTooEarlyError(BusinessRuleError):
    """El horario pedido es anterior al primero en el que el local puede tener listo el pedido."""

    def __init__(self, earliest: datetime, delay_minutes: int):
        self.earliest = earliest
        self.delay_minutes = delay_minutes
        super().__init__(f"Lo más temprano que podemos tener el pedido es a las {earliest:%H:%M}.")


# --- Demora y horarios --------------------------------------------------------------------------------


def estimate_delay_minutes(db: Session) -> int:
    """Demora estimada para un pedido nuevo según los pedidos en preparación (confirmados y todavía no
    despachados ni listos para retirar)."""
    in_progress = db.query(Order).filter(Order.status == OrderStatus.CONFIRMED.value).count()
    return BASE_DELAY_MINUTES + in_progress * MINUTES_PER_ORDER_IN_PROGRESS


def _round_up_to_minute(moment: datetime) -> datetime:
    rounded = moment.replace(second=0, microsecond=0)
    return rounded if rounded == moment else rounded + timedelta(minutes=1)


def validate_schedule(db: Session, requested: datetime, now: datetime, tolerance_minutes: int = 0) -> None:
    """Verifica que el pedido programado se llegue a preparar con la demora actual.

    La tolerancia evita rechazar al confirmar un horario que era válido cuando se le propuso al cliente y
    quedó apenas por debajo del mínimo por el tiempo que pasó en la conversación.
    """
    delay = estimate_delay_minutes(db)
    earliest = _round_up_to_minute(now + timedelta(minutes=delay))
    if requested + timedelta(minutes=tolerance_minutes) < earliest:
        raise ScheduleTooEarlyError(earliest, delay)


# --- Alta de pedidos ----------------------------------------------------------------------------------


def _products_for(db: Session, items: list[tuple[int, int]]) -> list[tuple[Product, int]]:
    ids = {product_id for product_id, _ in items}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(ids)).all()} if ids else {}
    if len(products) != len(ids):
        raise InvalidOrderError("Algunos productos del pedido ya no existen en el menú.")
    return [(products[product_id], quantity) for product_id, quantity in items]


def _new_order(db: Session, request: OrderRequest, source: OrderSource) -> Order:
    """Arma el pedido (sin guardarlo) validándolo contra el menú actual, con los precios de la base."""
    order = Order(
        customer_name=request.customer_name,
        customer_phone=request.customer_phone,
        notes=request.notes or None,
        source=source.value,
        status=OrderStatus.PENDING.value,
    )
    order.set_delivery(request.delivery_method, request.shipping_address)
    order.set_items(_products_for(db, request.items))
    return order


def _save(db: Session, order: Order) -> Order:
    db.add(order)
    commit(db)
    db.refresh(order)
    return order


def create_web_order(db: Session, request: OrderRequest, user: User | None = None) -> Order:
    """Pedido hecho desde la web: queda 'Pendiente' hasta que el local lo acepte.

    Se puede pedir como invitado. Si quien pide tiene sesión de cliente, el pedido queda asociado a su
    cuenta (los datos de contacto son siempre los enviados en el pedido).
    """
    order = _new_order(db, request, OrderSource.WEB)
    order.customer_id = user.id if user is not None and user.is_customer else None
    return _save(db, order)


def create_counter_order(db: Session, request: OrderRequest, payment: CounterPayment) -> Order:
    """Pedido presencial cargado por el personal en el mostrador.

    Como lo registra el propio local, entra directamente 'Confirmado' con la demora estimada
    automática, sin pasar por la aceptación (ni disparar la alerta de pedidos pendientes).
    Además registra (o actualiza) al cliente en la agenda del local para autocompletar sus
    próximos pedidos.
    """
    order = _new_order(db, request, OrderSource.COUNTER)
    order.status = OrderStatus.CONFIRMED.value
    order.estimated_minutes = estimate_delay_minutes(db)
    order.payment_method = payment.method
    order.is_paid = payment.is_paid
    order = _save(db, order)
    _register_client(db, request)
    return order


def create_bot_order(
    db: Session, request: OrderRequest, telegram_chat_id: str | None, scheduled_for: datetime | None
) -> Order:
    """Pedido confirmado por el cliente en el chat del bot: queda 'Pendiente' como los de la web."""
    order = _new_order(db, request, OrderSource.BOT)
    order.telegram_chat_id = telegram_chat_id
    order.scheduled_for = scheduled_for
    return _save(db, order)


def _register_client(db: Session, request: OrderRequest) -> None:
    """Guarda los datos del cliente del pedido en la agenda.

    Se hace después de guardar el pedido y sin propagar errores: si la agenda falla, el pedido
    ya quedó registrado y el flujo de carga no se interrumpe.
    """
    address = request.shipping_address if DeliveryMethod(request.delivery_method) == DeliveryMethod.DELIVERY else None
    try:
        upsert_client(db, request.customer_phone, request.customer_name, address)
        commit(db)
    except SQLAlchemyError:
        logger.exception("No se pudo registrar al cliente del pedido presencial en la agenda.")


# --- Consulta y ciclo de vida -------------------------------------------------------------------------


def list_orders(
    db: Session,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    statuses: list[str] | None = None,
) -> list[Order]:
    """Pedidos registrados, del más reciente al más antiguo, filtrados por fecha de creación y estado."""
    query = db.query(Order).options(joinedload(Order.items))
    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)
    if statuses:
        query = query.filter(Order.status.in_(statuses))
    return query.order_by(Order.created_at.desc()).all()


def get_order(db: Session, order_id: int) -> Order:
    """Pedido con sus ítems y productos."""
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise NotFoundError("Pedido no encontrado")
    return order


def change_order_status(
    db: Session, order_id: int, new_status: OrderStatus | str, estimated_minutes: int | None = None
) -> Order:
    """Avanza el pedido al nuevo estado según las reglas de su ciclo de vida (ver Order.transition_to)."""
    order = get_order(db, order_id)
    order.transition_to(new_status, estimated_minutes, current_delay_minutes=estimate_delay_minutes(db))
    commit(db)
    db.refresh(order)
    return order
