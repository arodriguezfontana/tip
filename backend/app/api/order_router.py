from datetime import datetime

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status as http_status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_admin, get_optional_current_user
from app.db.session import get_db
from app.modules.order import Order
from app.modules.user import ROLE_CUSTOMER, User
from app.schemas.order_schemas import (
    OrderResponse,
    OrderStatusUpdate,
    WebOrderCreate,
    WebOrderCreatedResponse,
    WebOrderItemResponse,
)
from app.services.order_notification_service import notify_order_status_change
from app.services.order_service import (
    InvalidTransitionError,
    MissingEstimatedMinutesError,
    transition_order_status,
)
from app.services.web_order_service import InvalidOrderError, create_counter_order, create_web_order

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_response(order: Order) -> OrderResponse:
    return OrderResponse(
        id=order.id,
        customer_name=order.customer_name,
        shipping_address=order.shipping_address,
        total_amount=order.total_amount,
        status=order.status,
        delivery_method=order.delivery_method,
        source=order.source,
        customer_phone=order.customer_phone,
        notes=order.notes,
        estimated_minutes=order.estimated_minutes,
        scheduled_for=order.scheduled_for,
        created_at=order.created_at,
        item_count=len(order.items),
    )


@router.get("", response_model=list[OrderResponse])
def list_orders(
    date_from: datetime | None = Query(None, description="Fecha/hora mínima (inclusive) de creación del pedido."),
    date_to: datetime | None = Query(None, description="Fecha/hora máxima (inclusive) de creación del pedido."),
    status: list[str] | None = Query(None, description="Filtra por uno o más estados del pedido."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[OrderResponse]:
    """Lista los pedidos registrados, opcionalmente filtrados por rango de fechas y/o estado."""
    query = db.query(Order).options(joinedload(Order.items))

    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)
    if status:
        query = query.filter(Order.status.in_(status))

    orders = query.order_by(Order.created_at.desc()).all()

    return [_to_response(order) for order in orders]

def _to_created_response(order: Order) -> WebOrderCreatedResponse:
    return WebOrderCreatedResponse(
        id=order.id,
        status=order.status,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        delivery_method=order.delivery_method,
        shipping_address=order.shipping_address,
        notes=order.notes,
        total_amount=order.total_amount,
        created_at=order.created_at,
        items=[
            WebOrderItemResponse(
                product_id=item.product_id,
                product_name=item.product.name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                subtotal=item.unit_price * item.quantity,
            )
            for item in order.items
        ],
    )


@router.post("/web", response_model=WebOrderCreatedResponse, status_code=http_status.HTTP_201_CREATED)
def create_order_from_web(
    payload: WebOrderCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> WebOrderCreatedResponse:
    """Endpoint público: registra un pedido hecho desde la web del cliente.

    Valida que los productos existan, estén disponibles y que las cantidades sean válidas;
    los precios se toman de la base de datos. El pedido queda 'Pendiente' igual que los del bot.
    Se puede pedir como invitado; si el cliente tiene la sesión iniciada, el pedido queda asociado
    a su cuenta (los datos de contacto son siempre los enviados en el pedido).
    """
    customer = current_user if current_user is not None and current_user.role == ROLE_CUSTOMER else None
    try:
        order = create_web_order(db, payload, customer=customer)
    except InvalidOrderError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except SQLAlchemyError:
        logger.exception("Error al guardar un pedido web.")
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos registrar tu pedido en este momento. Por favor, intentá nuevamente en unos minutos.",
        )

    return _to_created_response(order)


@router.post("/counter", response_model=WebOrderCreatedResponse, status_code=http_status.HTTP_201_CREATED)
def create_order_from_counter(
    payload: WebOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> WebOrderCreatedResponse:
    """Registra un pedido presencial cargado por el personal desde el panel.

    Aplica las mismas validaciones que los pedidos web y entra directamente 'Confirmado'.
    """
    try:
        order = create_counter_order(db, payload)
    except InvalidOrderError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except SQLAlchemyError:
        logger.exception("Error al guardar un pedido presencial.")
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo registrar el pedido en este momento. Intentá nuevamente.",
        )

    return _to_created_response(order)


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> OrderResponse:
    """Actualiza el estado de un pedido, validando que la transición sea válida."""
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    try:
        order = transition_order_status(db, order, status_update.status, status_update.estimated_minutes)
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except MissingEstimatedMinutesError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    background_tasks.add_task(notify_order_status_change, order, status_update.status)

    return _to_response(order)