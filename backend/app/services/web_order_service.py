"""Lógica de negocio para registrar pedidos cargados con productos del menú: los que hace el
cliente desde la web y los que carga el personal en el mostrador para clientes presenciales."""

import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.modules.menu import Product
from app.modules.order import Order, OrderItem
from app.modules.user import User
from app.schemas.order_schemas import MAX_QUANTITY_PER_ITEM, CounterOrderCreate, WebOrderCreate
from app.services.business_hours_service import verificar_local_abierto
from app.services.client_service import upsert_client
from app.services.order_service import calcular_demora_actual

logger = logging.getLogger(__name__)

PICKUP_ADDRESS = "Retiro en el local"


class InvalidOrderError(Exception):
    """El pedido no puede registrarse porque sus datos no son válidos contra el menú actual."""


def _merge_quantities(payload: WebOrderCreate) -> dict[int, int]:
    """Agrupa las líneas repetidas de un mismo producto sumando sus cantidades."""
    quantities: dict[int, int] = {}
    for item in payload.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    return quantities


def _build_order(db: Session, payload: WebOrderCreate, source: str) -> Order:
    """Valida el pedido contra el menú actual y arma la orden (sin persistirla) con precios de la base."""
    quantities = _merge_quantities(payload)

    products = db.query(Product).filter(Product.id.in_(quantities.keys())).all()
    products_by_id = {product.id: product for product in products}

    missing_ids = [product_id for product_id in quantities if product_id not in products_by_id]
    if missing_ids:
        raise InvalidOrderError(
            "Algunos productos del pedido no existen en el menú. Actualizá la página e intentá nuevamente."
        )

    unavailable = [products_by_id[product_id].name for product_id in quantities if not products_by_id[product_id].is_active]
    if unavailable:
        raise InvalidOrderError(
            f"Estos productos no están disponibles en este momento: {', '.join(unavailable)}. "
            "Quitalos del carrito para continuar."
        )

    exceeded = [products_by_id[product_id].name for product_id, qty in quantities.items() if qty > MAX_QUANTITY_PER_ITEM]
    if exceeded:
        raise InvalidOrderError(
            f"Superaste la cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: {', '.join(exceeded)}."
        )

    is_pickup = payload.delivery_method == "retiro"
    order = Order(
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        shipping_address=PICKUP_ADDRESS if is_pickup else payload.shipping_address,
        notes=payload.notes or None,
        delivery_method=payload.delivery_method,
        status="Pendiente",
        source=source,
        total_amount=sum(products_by_id[product_id].price * qty for product_id, qty in quantities.items()),
    )
    order.items = [
        OrderItem(product_id=product_id, quantity=qty, unit_price=products_by_id[product_id].price)
        for product_id, qty in quantities.items()
    ]
    return order


def _persist(db: Session, order: Order) -> Order:
    db.add(order)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(order)
    return order


def create_web_order(db: Session, payload: WebOrderCreate, customer: User | None = None) -> Order:
    """Pedido hecho por el cliente desde la web: queda 'Pendiente' hasta que el local lo acepte.

    Solo se aceptan dentro del horario de atención (si no, lanza LocalCerradoError).
    """
    verificar_local_abierto(db)
    order = _build_order(db, payload, source="web")
    order.customer_id = customer.id if customer is not None else None
    return _persist(db, order)


def create_counter_order(db: Session, payload: CounterOrderCreate) -> Order:
    """Pedido presencial cargado por el personal en el mostrador.

    Como lo registra el propio local, entra directamente 'Confirmado' con la demora estimada
    automática, sin pasar por la aceptación (ni disparar la alerta de pedidos pendientes).
    Además registra (o actualiza) al cliente en la agenda del local para autocompletar sus
    próximos pedidos.
    """
    order = _build_order(db, payload, source="mostrador")
    order.status = "Confirmado"
    order.estimated_minutes = calcular_demora_actual(db)
    order.payment_method = payload.payment_method
    order.is_paid = payload.is_paid
    order = _persist(db, order)
    _register_client(db, payload)
    return order


def _register_client(db: Session, payload: WebOrderCreate) -> None:
    """Guarda los datos del cliente del pedido en la agenda.

    Se hace después de guardar el pedido y sin propagar errores: si la agenda falla, el pedido
    ya quedó registrado y el flujo de carga no se interrumpe.
    """
    address = payload.shipping_address if payload.delivery_method == "domicilio" else None
    try:
        upsert_client(db, payload.customer_phone, payload.customer_name, address)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("No se pudo registrar al cliente del pedido presencial en la agenda.")
