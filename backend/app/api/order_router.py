from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.modules.order import Order
from app.modules.user import User
from app.schemas.order_schemas import OrderResponse, OrderStatusUpdate
from app.services.order_notification_service import notify_order_status_change
from app.services.order_service import (
    InvalidTransitionError,
    MissingEstimatedMinutesError,
    transition_order_status,
)

router = APIRouter()


def _to_response(order: Order) -> OrderResponse:
    return OrderResponse(
        id=order.id,
        customer_name=order.customer_name,
        shipping_address=order.shipping_address,
        total_amount=order.total_amount,
        status=order.status,
        delivery_method=order.delivery_method,
        estimated_minutes=order.estimated_minutes,
        created_at=order.created_at,
        item_count=len(order.items),
    )


@router.get("", response_model=list[OrderResponse])
def list_orders(
    date_from: datetime | None = Query(None, description="Fecha/hora mínima (inclusive) de creación del pedido."),
    date_to: datetime | None = Query(None, description="Fecha/hora máxima (inclusive) de creación del pedido."),
    status: list[str] | None = Query(None, description="Filtra por uno o más estados del pedido."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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