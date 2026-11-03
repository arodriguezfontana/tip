"""Casos de uso de los pedidos: registrarlos desde cada canal (web, mostrador y bot), consultarlos y
avanzarlos en su ciclo de vida. Las reglas del pedido en sí viven en el modelo Order."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.channels import Channel
from app.core.errors import BusinessRuleError, NotFoundError
from app.db.session import transaction
from app.models.order import DeliveryMethod, InvalidOrderError, Order, OrderSource, OrderStatus, PaymentMethod
from app.models.user import User
from app.repositories import delivery_driver_repository, order_repository, product_repository, promotion_repository
from app.services import cash_shift_service
from app.services.business_hours_service import verificar_local_abierto
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
    # (product_id, cantidad) o (product_id, cantidad, secondary_product_id, custom_name, mods, promotion_id).
    items: list[tuple]


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
    in_progress = order_repository.count_with_status(db, OrderStatus.CONFIRMED)
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


def _products_for(
    db: Session, items: list[tuple]
) -> list[tuple[Any, int, Any, str | None, list[dict], Any]]:
    product_ids = set()
    promotion_ids = set()
    for item in items:
        p_id = item[0]
        promo_id = item[5] if len(item) > 5 else None
        if promo_id is not None:
            promotion_ids.add(promo_id)
        elif p_id is not None:
            product_ids.add(p_id)
            if len(item) > 2 and item[2] is not None:
                product_ids.add(item[2])
        else:
            raise InvalidOrderError("Cada ítem debe tener un producto o una promoción.")

    products = product_repository.get_many(db, product_ids) if product_ids else {}
    if len(products) != len(product_ids):
        raise InvalidOrderError("Algunos productos del pedido ya no existen en el menú.")

    promotions = promotion_repository.get_many(db, promotion_ids) if promotion_ids else {}
    if len(promotions) != len(promotion_ids):
        raise InvalidOrderError("Algunas promociones del pedido ya no están disponibles.")

    result = []
    for item in items:
        p_id = item[0]
        qty = item[1]
        p2_id = item[2] if len(item) > 2 and item[2] is not None else None
        custom_name = item[3] if len(item) > 3 else None
        mods = item[4] if len(item) > 4 and item[4] else []
        promo_id = item[5] if len(item) > 5 else None

        if promo_id is not None:
            promo = promotions[promo_id]
            result.append((None, qty, None, custom_name or promo.name, mods, promo))
        else:
            p1 = products[p_id]
            p2 = products[p2_id] if p2_id is not None else None
            result.append((p1, qty, p2, custom_name, mods, None))
    return result


def _attach_notes_modifiers(db: Session, notes: str | None, parsed_items: list[tuple]) -> list[tuple]:
    """Interpreta exclusiones y extras en lenguaje natural de las observaciones y los asocia a los ítems del pedido."""
    if not notes or not str(notes).strip():
        return parsed_items
    # Si los ítems ya traen modificaciones explícitas (ej. bot con desglose previo), no las sobreescribimos
    if any(len(line) > 4 and line[4] for line in parsed_items):
        return parsed_items

    from app.services.modifier_nlp import (
        extraer_modificadores_de_texto,
        vincular_modificadores_con_db,
    )

    _, raw_mods = extraer_modificadores_de_texto(str(notes), db=db)
    if not raw_mods:
        return parsed_items

    linked_mods = vincular_modificadores_con_db(db, raw_mods)
    # Solo consideramos modificadores que correspondan a ingredientes del sistema o extras con costo
    valid_mods = [
        m for m in linked_mods
        if m.get("ingredient_id") is not None or (float(m.get("price") or 0) > 0)
    ]
    if not valid_mods:
        return parsed_items

    # Obtener ingredientes de cada ítem para asociar modificaciones a la receta correcta
    item_ing_map: list[set[int]] = []
    for line in parsed_items:
        p1 = line[0]
        p2 = line[2] if len(line) > 2 else None
        promo = line[5] if len(line) > 5 else None

        prods = []
        if promo is not None and hasattr(promo, "items"):
            prods.extend([item.product for item in promo.items if getattr(item, "product", None)])
        if p1 is not None:
            prods.append(p1)
        if p2 is not None:
            prods.append(p2)

        ing_ids = set()
        for p in prods:
            if hasattr(p, "recipe_items") and p.recipe_items:
                for ri in p.recipe_items:
                    if ri.ingredient_id is not None:
                        ing_ids.add(ri.ingredient_id)
        item_ing_map.append(ing_ids)

    item_mods_to_add: dict[int, list[dict]] = {i: [] for i in range(len(parsed_items))}

    for mod in valid_mods:
        mod_ing_id = mod.get("ingredient_id")
        assigned_idx = None

        if mod_ing_id is not None:
            matching_indices = [i for i, ings in enumerate(item_ing_map) if mod_ing_id in ings]
            if matching_indices:
                assigned_idx = matching_indices[0]

        if assigned_idx is None:
            if len(parsed_items) == 1:
                assigned_idx = 0
            else:
                # Priorizar el primer ítem que no sea bebida/barra
                food_indices = [
                    i for i, line in enumerate(parsed_items)
                    if line[0] is not None
                    and getattr(line[0], "category", None)
                    and getattr(line[0].category, "sector", "") != "barra"
                ]
                assigned_idx = food_indices[0] if food_indices else 0

        item_mods_to_add[assigned_idx].append(mod)

    updated_items = []
    for i, line in enumerate(parsed_items):
        p1 = line[0]
        qty = line[1]
        p2 = line[2] if len(line) > 2 else None
        cname = line[3] if len(line) > 3 else None
        existing_mods = list(line[4]) if len(line) > 4 and line[4] else []
        promo = line[5] if len(line) > 5 else None
        all_mods = existing_mods + item_mods_to_add.get(i, [])
        updated_items.append((p1, qty, p2, cname, all_mods, promo))

    return updated_items


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
    parsed_items = _products_for(db, request.items)
    parsed_items = _attach_notes_modifiers(db, request.notes, parsed_items)
    order.set_items(parsed_items)
    return order


def _save(db: Session, order: Order) -> Order:
    with transaction(db):
        order_repository.add(db, order)
    db.refresh(order)
    return order


def create_web_order(
    db: Session,
    request: OrderRequest,
    user: User | None = None,
    payment_method: PaymentMethod | str = PaymentMethod.CASH,
) -> Order:
    """Pedido hecho desde la web: se acepta automáticamente (entra 'Confirmado' con la demora estimada
    del local, sin pasar por aceptar/rechazar) y queda sin abonar. El local puede cancelarlo después.

    Se puede pedir como invitado. Si quien pide tiene sesión de cliente, el pedido queda asociado a su
    cuenta (los datos de contacto son siempre los enviados en el pedido). Solo se aceptan dentro del
    horario de atención del local (si no, lanza LocalCerradoError).
    """
    verificar_local_abierto(db)
    order = _new_order(db, request, OrderSource.WEB)
    order.customer_id = user.id if user is not None and user.is_customer else None
    order.status = OrderStatus.CONFIRMED.value
    order.estimated_minutes = estimate_delay_minutes(db)
    order.payment_method = PaymentMethod(payment_method).value
    order.is_paid = False
    shift = cash_shift_service.get_current_open_shift(db)
    if shift:
        order.cash_shift_id = shift.id
    return _save(db, order)


def create_counter_order(db: Session, request: OrderRequest, payment: CounterPayment) -> Order:
    """Pedido presencial cargado por el personal en el mostrador.

    Como lo registra el propio local, entra directamente 'Confirmado' con la demora estimada
    automática, sin pasar por la aceptación (ni disparar la alerta de pedidos pendientes).
    Además registra (o actualiza) al cliente en la agenda del local para autocompletar sus
    próximos pedidos.
    """
    shift = cash_shift_service.get_current_open_shift(db)
    if not shift:
        raise BusinessRuleError("No se pueden tomar ni facturar pedidos porque la caja no está abierta. Abrí la caja antes de continuar.")

    order = _new_order(db, request, OrderSource.COUNTER)
    order.cash_shift_id = shift.id
    order.status = OrderStatus.CONFIRMED.value
    order.estimated_minutes = estimate_delay_minutes(db)
    order.payment_method = payment.method
    order.is_paid = payment.is_paid
    order = _save(db, order)
    _register_client(db, request)
    return order


def create_bot_order(
    db: Session,
    request: OrderRequest,
    channel: Channel | str | None,
    chat_id: str | None,
    scheduled_for: datetime | None,
    payment_method: str | None = None,
) -> Order:
    """Pedido confirmado por el cliente en el chat del bot (de cualquier canal): queda 'Pendiente' como los de la web."""
    order = _new_order(db, request, OrderSource.BOT)
    order.channel = Channel(channel).value if channel else None
    order.chat_id = chat_id
    order.scheduled_for = scheduled_for
    order.payment_method = payment_method
    order.is_paid = False
    shift = cash_shift_service.get_current_open_shift(db)
    if shift:
        order.cash_shift_id = shift.id
    order = _save(db, order)
    # Queda en la agenda (nombre, teléfono y dirección de envío) para reconocerlo en su próximo pedido.
    _register_client(db, request)
    return order


def _register_client(db: Session, request: OrderRequest) -> None:
    """Guarda los datos del cliente del pedido en la agenda.

    Se hace después de guardar el pedido y sin propagar errores: si la agenda falla, el pedido
    ya quedó registrado y el flujo de carga no se interrumpe.
    """
    address = request.shipping_address if DeliveryMethod(request.delivery_method) == DeliveryMethod.DELIVERY else None
    try:
        with transaction(db):
            upsert_client(db, request.customer_phone, request.customer_name, address)
    except SQLAlchemyError:
        logger.exception("No se pudo registrar al cliente del pedido en la agenda.")


# --- Consulta y ciclo de vida -------------------------------------------------------------------------


def list_orders(
    db: Session,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    statuses: list[str] | None = None,
    sector: str | None = None,
) -> list[Order]:
    """Pedidos registrados, del más reciente al más antiguo, filtrados por fecha de creación, estado y sector."""
    return order_repository.list_orders(db, date_from, date_to, statuses, sector)


def get_order(db: Session, order_id: int) -> Order:
    """Pedido con sus ítems y productos."""
    order = order_repository.get_with_items(db, order_id)
    if order is None:
        raise NotFoundError("Pedido no encontrado")
    return order


def change_order_status(
    db: Session,
    order_id: int,
    new_status: OrderStatus | str,
    estimated_minutes: int | None = None,
    delivery_driver_id: int | None = None,
) -> Order:
    """Avanza el pedido al nuevo estado según las reglas de su ciclo de vida (ver Order.transition_to)."""
    order = get_order(db, order_id)
    if delivery_driver_id is not None:
        if order.delivery_method != DeliveryMethod.DELIVERY.value:
            raise BusinessRuleError("Solo se pueden asignar repartidores a pedidos con envío a domicilio.")
        driver = delivery_driver_repository.get(db, delivery_driver_id)
        if driver is None:
            raise NotFoundError("Repartidor no encontrado.")
        if not driver.is_active:
            raise BusinessRuleError("Solo se pueden asignar repartidores activos.")
        order.delivery_driver_id = driver.id

    with transaction(db):
        order.transition_to(new_status, estimated_minutes, current_delay_minutes=estimate_delay_minutes(db))
    db.refresh(order)
    return order


def assign_delivery_driver(
    db: Session, order_id: int, delivery_driver_id: int | None
) -> Order:
    """Asigna (o desasigna) un repartidor de la lista de personal activo a un pedido con envío a domicilio."""
    order = get_order(db, order_id)
    if order.delivery_method != DeliveryMethod.DELIVERY.value:
        raise BusinessRuleError("Solo se pueden asignar repartidores a pedidos con envío a domicilio.")

    if delivery_driver_id is not None:
        driver = delivery_driver_repository.get(db, delivery_driver_id)
        if driver is None:
            raise NotFoundError("Repartidor no encontrado.")
        if not driver.is_active:
            raise BusinessRuleError("Solo se pueden asignar repartidores activos.")
        order.delivery_driver_id = driver.id
    else:
        order.delivery_driver_id = None

    with transaction(db):
        pass
    db.refresh(order)
    return order


def update_order_payment(db: Session, order_id: int, is_paid: bool) -> Order:
    """Actualiza manualmente el estado de cobro de un pedido."""
    order = get_order(db, order_id)
    if order.is_shift_closed:
        raise BusinessRuleError("No se puede modificar el pago de un pedido con turno de caja cerrado.")
    if is_paid and not order.cash_shift_id:
        shift = cash_shift_service.get_current_open_shift(db)
        if not shift:
            raise BusinessRuleError("No se pueden cobrar pedidos porque no hay una caja abierta.")
        order.cash_shift_id = shift.id
    order.is_paid = is_paid
    with transaction(db):
        pass
    db.refresh(order)
    return order


def update_order_item_prepared(db: Session, order_id: int, item_id: int, is_prepared: bool) -> Order:
    """Marca o desmarca un ítem individual de una comanda como preparado."""
    order = get_order(db, order_id)
    item = next((i for i in order.items if i.id == item_id), None)
    if item is None:
        raise NotFoundError("Ítem no encontrado en el pedido.")
    item.is_prepared = is_prepared
    with transaction(db):
        pass
    db.refresh(order)
    return order


def update_order_sector_prepared(db: Session, order_id: int, sector: str, is_prepared: bool) -> Order:
    """Marca o desmarca todos los ítems de un sector en una comanda como preparados."""
    order = get_order(db, order_id)
    sector_clean = sector.strip().lower()
    matched = False
    for item in order.items:
        if item.sector.lower() == sector_clean:
            item.is_prepared = is_prepared
            matched = True
    if not matched:
        raise NotFoundError(f"No hay ítems para el sector '{sector}' en este pedido.")
    with transaction(db):
        pass
    db.refresh(order)
    return order


# --- Cambios que pide el cliente sobre un pedido ya registrado ----------------------------------------


def find_latest_chat_order(db: Session, channel: Channel | str, chat_id: str) -> Order | None:
    """Último pedido del cliente de ese chat, para modificarlo (ver Order.add_items y Order.change_payment_method)."""
    return order_repository.latest_for_chat(db, Channel(channel).value, chat_id)


def add_items_to_order(db: Session, order: Order, items: list[tuple]) -> Decimal:
    """Suma productos a un pedido ya registrado y devuelve lo que costaron. Cocina ve el aviso en su tablero."""
    products = _products_for(db, items)
    with transaction(db):
        added = order.add_items(products)
    db.refresh(order)
    return added


def change_order_payment_method(db: Session, order: Order, method: PaymentMethod | str) -> None:
    """Cambia el medio de pago del pedido (o el de la diferencia, si tiene un pago parcial). No toca a cocina."""
    with transaction(db):
        order.change_payment_method(method)
    db.refresh(order)


def acknowledge_kitchen_update(db: Session, order_id: int) -> Order:
    """Cocina vio los productos agregados: se apaga la alerta del tablero."""
    order = get_order(db, order_id)
    order.kitchen_update_pending = False
    with transaction(db):
        pass
    db.refresh(order)
    return order
