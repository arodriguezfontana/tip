import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_optional_current_user
from app.db.session import get_db
from app.models.order import OrderStatus, PaymentMethod
from app.models.user import User
from app.schemas.delivery_driver_schemas import OrderAssignDriverPayload
from app.schemas.order_schemas import (
    CounterOrderCreate,
    OrderDelayEstimateResponse,
    OrderDetailResponse,
    OrderItemPreparedUpdate,
    OrderPaymentUpdate,
    OrderResponse,
    OrderSectorPreparedUpdate,
    OrderStatusUpdate,
    TripDispatchPayload,
    TripResponse,
    WebOrderCreate,
    WebOrderCreatedResponse,
)
from app.schemas.printer_schemas import PrintResult
from app.services import delivery_trip_service, order_service, printer_service
from app.services.channels import enviar_mensaje
from app.services.mercadopago_service import (
    payment_received_message,
    reconcile_pending_payments,
    start_chat_payment,
    start_web_payment,
)
from app.services.order_notification_service import OrderSnapshot, notify_order_status_change, notify_trip_dispatched
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
    background_tasks: BackgroundTasks,
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
    # El pedido web entra ya aceptado: la comanda sale sola hacia cocina sin hacer esperar al cliente.
    printer_service.print_order_in_background(background_tasks, db, order)
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
    # La comanda se imprime recién con el pedido guardado; si la impresora falla, el pedido queda registrado igual.
    result = printer_service.print_order(db, order)
    response = WebOrderCreatedResponse.from_model(order)
    response.print_error = None if result.success else (result.message or "Error de impresión.")
    return response


@router.post("/{order_id}/print", response_model=PrintResult)
def reprint_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PrintResult:
    """Vuelve a imprimir la comanda de un pedido (papel atascado, ticket perdido). No modifica el pedido."""
    return printer_service.print_order(db, order_service.get_order(db, order_id))


@router.get("/{order_id}", response_model=OrderDetailResponse)
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderDetailResponse:
    """Detalle completo de un pedido: productos, datos del cliente y de la entrega, y facturación."""
    return OrderDetailResponse.from_model(order_service.get_order(db, order_id))


@router.post("/trips/dispatch", response_model=TripResponse, status_code=http_status.HTTP_201_CREATED)
def dispatch_delivery_trip(
    payload: TripDispatchPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> TripResponse:
    """Inicia el viaje de un repartidor: calcula una sola ruta con Google Maps para todos sus pedidos armados y avisa
    a cada cliente cuánto va a tardar en llegar (si no se puede calcular, sale igual y el aviso va sin tiempo). Los pedidos que se sumen después forman el viaje siguiente."""
    trip, warning = delivery_trip_service.dispatch_trip(db, payload.delivery_driver_id, payload.order_ids)
    background_tasks.add_task(notify_trip_dispatched, [OrderSnapshot.of(order) for order in trip.orders])
    return TripResponse.from_model(trip, warning)


@router.get("/{order_id}/estimate", response_model=OrderDelayEstimateResponse)
def get_order_delay_estimate(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderDelayEstimateResponse:
    """Cómo se va a estimar la demora si se acepta el pedido ahora: automática (con el historial del local) o
    manual, si todavía no hay datos suficientes para esa situación."""
    order = order_service.get_order(db, order_id)
    estimate = order_service.estimate_acceptance_delay(db, order)
    return OrderDelayEstimateResponse(
        mode=estimate.mode.value,
        estimated_minutes=estimate.minutes,
        samples=estimate.samples,
        min_samples=estimate.min_samples,
        queue_size=estimate.queue_size,
        suggested_minutes=order_service.estimate_delay_minutes(db),
    )


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Avanza el pedido de estado según su ciclo de vida y le avisa al cliente por su canal de chat."""
    previous_status = order_service.get_order(db, order_id).status
    order = order_service.change_order_status(
        db,
        order_id,
        status_update.status,
        status_update.estimated_minutes,
        status_update.delivery_driver_id,
    )
    # Los pedidos del chat se pagan una vez aceptados: así nadie paga un pedido que el local después rechaza.
    payment_instructions = None
    # Al aceptar un pedido pendiente la comanda va a cocina (los de mostrador ya se imprimieron al registrarlos).
    just_confirmed = status_update.status == OrderStatus.CONFIRMED and previous_status == OrderStatus.PENDING.value
    if status_update.status == OrderStatus.CONFIRMED:
        payment_instructions = start_chat_payment(db, order, get_or_create_store_config(db))
    background_tasks.add_task(
        notify_order_status_change, OrderSnapshot.of(order), status_update.status, payment_instructions
    )
    response = OrderResponse.from_model(order)
    if just_confirmed:
        result = printer_service.print_order(db, order)
        response.print_error = None if result.success else (result.message or "Error de impresión.")
    return response


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
