from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.modules.order import Order
from app.modules.user import User
from app.schemas.order_schemas import OrderResponse, OrderStatusUpdate

router = APIRouter()


@router.get("", response_model=list[OrderResponse])
def list_orders(
    date_from: datetime | None = Query(None, description="Fecha/hora mínima (inclusive) de creación del pedido."),
    date_to: datetime | None = Query(None, description="Fecha/hora máxima (inclusive) de creación del pedido."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrderResponse]:
    """Lista los pedidos registrados, opcionalmente filtrados por rango de fechas."""
    query = db.query(Order).options(joinedload(Order.items))

    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)

    orders = query.order_by(Order.created_at.desc()).all()

    return [
        OrderResponse(
            id=order.id,
            customer_name=order.customer_name,
            shipping_address=order.shipping_address,
            total_amount=order.total_amount,
            status=order.status,
            created_at=order.created_at,
            item_count=len(order.items),
        )
        for order in orders
    ]

@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrderResponse:
    """Actualiza el estado de un pedido."""
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    
    order.status = status_update.status
    db.commit()
    db.refresh(order)

    return OrderResponse(
        id=order.id,
        customer_name=order.customer_name,
        shipping_address=order.shipping_address,
        total_amount=order.total_amount,
        status=order.status,
        created_at=order.created_at,
        item_count=len(order.items),
    )