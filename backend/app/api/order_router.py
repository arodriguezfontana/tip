import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_optional_current_user
from app.db.session import get_db
from app.models.order import PaymentMethod
from app.models.user import User
from app.schemas.delivery_driver_schemas import OrderAssignDriverPayload
from app.schemas.order_schemas import (
    CounterOrderCreate,
    OrderDetailResponse,
    OrderItemPreparedUpdate,
    OrderPaymentUpdate,
    OrderResponse,
    OrderSectorPreparedUpdate,
    OrderStatusUpdate,
    WebOrderCreate,
    WebOrderCreatedResponse,
)
from app.services import order_service
from app.services.channels import enviar_mensaje
from app.services.mercadopago_service import payment_received_message, reconcile_pending_payments, start_web_payment
from app.services.order_notification_service import OrderSnapshot, notify_order_status_change
from app.services.store_config_service import get_or_create_store_config

logger = logging.getLogger(__name__)

router = APIRouter()


def _unavailable(message: str) -> HTTPException:
    return HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


@router.get("", response_model=list[OrderResponse])
def list_orders(
    background_tasks: BackgroundTasks,
    date_from: datetime | None = Query(None, description="Fecha/hora mínima (inclusive) de creación del pedido."),
    date_to: datetime | None = Query(None, description="Fecha/hora máxima (inclusive) de creación del pedido."),
    status: list[str] | None = Query(None, description="Filtra por uno o más estados del pedido."),
    sector: str | None = Query(None, description="Filtra por sector de preparación (cocina, pizzeria, barra)."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[OrderResponse]:
    """Lista los pedidos registrados, opcionalmente filtrados por rango de fechas y/o estado.

    Antes de listar acredita los pedidos de MercadoPago que ya se pagaron y de los que no llegó el aviso
    (el tablero consulta seguido, así que el 'Abonado' aparece solo).
    """
    for paid in reconcile_pending_payments(db):
        if paid.channel and paid.chat_id:
            background_tasks.add_task(enviar_mensaje, paid.channel, paid.chat_id, payment_received_message(paid))
    return [
        OrderResponse.from_model(order)
        for order in order_service.list_orders(db, date_from, date_to, status, sector)
    ]


@router.post("/web", response_model=WebOrderCreatedResponse, status_code=http_status.HTTP_201_CREATED)
def create_order_from_web(
    payload: WebOrderCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> WebOrderCreatedResponse:
    """Endpoint público: registra un pedido hecho desde la web del cliente (como invitado o con su cuenta).

    Valida los productos contra el menú actual y toma los precios de la base. Queda 'Pendiente' y sin
    abonar. Si el cliente eligió MercadoPago, la respuesta incluye el link de pago (`payment_url`) al
    que la web lo redirige; el pago se acredita después por el webhook o al volver del checkout.
    """
    try:
        order = order_service.create_web_order(
            db, payload.to_request(), user=current_user, payment_method=payload.payment_method
        )
        payment_url = None
        if order.payment_method == PaymentMethod.MERCADOPAGO.value:
            payment_url = start_web_payment(db, order, store_name=get_or_create_store_config(db).store_name)
    except SQLAlchemyError:
        logger.exception("Error al guardar un pedido web.")
        raise _unavailable("No pudimos registrar tu pedido en este momento. Por favor, intentá nuevamente en unos minutos.")
    return WebOrderCreatedResponse.from_model(order, payment_url=payment_url)


@router.post("/counter", response_model=WebOrderCreatedResponse, status_code=http_status.HTTP_201_CREATED)
def create_order_from_counter(
    payload: CounterOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> WebOrderCreatedResponse:
    """Registra un pedido presencial cargado por el personal: entra directamente 'Confirmado'."""
    try:
        order = order_service.create_counter_order(db, payload.to_request(), payload.to_payment())
    except SQLAlchemyError:
        logger.exception("Error al guardar un pedido presencial.")
        raise _unavailable("No se pudo registrar el pedido en este momento. Intentá nuevamente.")
    return WebOrderCreatedResponse.from_model(order)


@router.get("/{order_id}", response_model=OrderDetailResponse)
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderDetailResponse:
    """Detalle completo de un pedido: productos, datos del cliente y de la entrega, y facturación."""
    return OrderDetailResponse.from_model(order_service.get_order(db, order_id))


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Avanza el pedido de estado según su ciclo de vida y le avisa al cliente por su canal de chat."""
    order = order_service.change_order_status(
        db,
        order_id,
        status_update.status,
        status_update.estimated_minutes,
        status_update.delivery_driver_id,
    )
    background_tasks.add_task(notify_order_status_change, OrderSnapshot.of(order), status_update.status)
    return OrderResponse.from_model(order)


@router.patch("/{order_id}/delivery-driver", response_model=OrderResponse)
def assign_order_delivery_driver(
    order_id: int,
    payload: OrderAssignDriverPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Asigna o desasigna un repartidor de la lista de personal activo a un pedido con envío a domicilio."""
    order = order_service.assign_delivery_driver(db, order_id, payload.delivery_driver_id)
    return OrderResponse.from_model(order)


@router.patch("/{order_id}/payment", response_model=OrderResponse)
def update_order_payment(
    order_id: int,
    payload: OrderPaymentUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Actualiza manualmente el estado de pago del pedido (Abonado)."""
    order = order_service.update_order_payment(db, order_id, payload.is_paid)
    # En efectivo el cliente le paga en mano al local: ahí no hace falta avisarle que se registró el cobro.
    if order.is_paid and order.channel and order.chat_id and not order.is_cash_payment:
        mensaje = f"✅ ¡Recibimos el pago de tu pedido #{order.id}! ¡Muchas gracias!"
        background_tasks.add_task(enviar_mensaje, order.channel, order.chat_id, mensaje)
    return OrderResponse.from_model(order)


@router.post("/{order_id}/kitchen-update/ack", response_model=OrderResponse)
def acknowledge_kitchen_update(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Cocina vio los productos que el cliente agregó al pedido: se apaga la alerta del tablero."""
    return OrderResponse.from_model(order_service.acknowledge_kitchen_update(db, order_id))


@router.patch("/{order_id}/items/{item_id}/prepared", response_model=OrderResponse)
def update_order_item_prepared(
    order_id: int,
    item_id: int,
    payload: OrderItemPreparedUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Marca o desmarca un ítem individual del pedido como preparado."""
    order = order_service.update_order_item_prepared(db, order_id, item_id, payload.is_prepared)
    return OrderResponse.from_model(order)


@router.patch("/{order_id}/sectors/{sector}/prepared", response_model=OrderResponse)
def update_order_sector_prepared(
    order_id: int,
    sector: str,
    payload: OrderSectorPreparedUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Marca o desmarca todos los ítems de un sector específico en el pedido como preparados."""
    order = order_service.update_order_sector_prepared(db, order_id, sector, payload.is_prepared)
    return OrderResponse.from_model(order)
