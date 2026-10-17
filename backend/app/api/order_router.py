import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_optional_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.delivery_driver_schemas import OrderAssignDriverPayload
from app.schemas.order_schemas import (
    CounterOrderCreate,
    OrderDetailResponse,
    OrderPaymentUpdate,
    OrderResponse,
    OrderStatusUpdate,
    WebOrderCreate,
    WebOrderCreatedResponse,
)
from app.services import order_service
from app.services.order_notification_service import OrderSnapshot, notify_order_status_change
from app.services.telegram_service import send_telegram_message

logger = logging.getLogger(__name__)

router = APIRouter()


def _unavailable(message: str) -> HTTPException:
    return HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


@router.get("", response_model=list[OrderResponse])
def list_orders(
    date_from: datetime | None = Query(None, description="Fecha/hora mínima (inclusive) de creación del pedido."),
    date_to: datetime | None = Query(None, description="Fecha/hora máxima (inclusive) de creación del pedido."),
    status: list[str] | None = Query(None, description="Filtra por uno o más estados del pedido."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[OrderResponse]:
    """Lista los pedidos registrados, opcionalmente filtrados por rango de fechas y/o estado."""
    return [OrderResponse.from_model(order) for order in order_service.list_orders(db, date_from, date_to, status)]


@router.post("/web", response_model=WebOrderCreatedResponse, status_code=http_status.HTTP_201_CREATED)
def create_order_from_web(
    payload: WebOrderCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> WebOrderCreatedResponse:
    """Endpoint público: registra un pedido hecho desde la web del cliente (como invitado o con su cuenta).

    Valida los productos contra el menú actual y toma los precios de la base. Queda 'Pendiente'.
    """
    try:
        order = order_service.create_web_order(db, payload.to_request(), user=current_user)
    except SQLAlchemyError:
        logger.exception("Error al guardar un pedido web.")
        raise _unavailable("No pudimos registrar tu pedido en este momento. Por favor, intentá nuevamente en unos minutos.")
    return WebOrderCreatedResponse.from_model(order)


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
    """Avanza el pedido de estado según su ciclo de vida y le avisa al cliente por Telegram."""
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
    if order.is_paid and order.telegram_chat_id:
        mensaje = (
            f"✅ ¡Tu pedido #{order.id} fue marcado como Abonado!\n"
            f"Registramos el pago en el sistema. ¡Muchas gracias!"
        )
        background_tasks.add_task(send_telegram_message, int(order.telegram_chat_id), mensaje)
    return OrderResponse.from_model(order)
