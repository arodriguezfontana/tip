from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import get_current_user
from app.db.session import get_db
from app.modules.order import Order
from app.modules.order_item import OrderItem
from app.modules.product import Product
from app.modules.user import User
from app.schemas.stats_schemas import (
    BestSellingDayResponse,
    StatusDistributionResponse,
    TopProductResponse,
)

router = APIRouter(prefix="/stats", tags=["Statistics"])


def _filter_orders_by_date(db: Session, date_from: datetime | None, date_to: datetime | None):
    query = db.query(Order)
    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)
    return query.all()


@router.get("/status-distribution", response_model=StatusDistributionResponse)
def get_status_distribution(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StatusDistributionResponse:
    """Devuelve la distribución de pedidos por su estado (Pendientes, Confirmados, Rechazados)."""
    orders = _filter_orders_by_date(db, date_from, date_to)
    
    distribution: Dict[str, int] = {}
    for order in orders:
        status = order.status.strip()
        distribution[status] = distribution.get(status, 0) + 1

    return StatusDistributionResponse(status_distribution=distribution)


@router.get("/top-products", response_model=list[TopProductResponse])
def get_top_products(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(5, description="Cantidad máxima de productos a retornar"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TopProductResponse]:
    """Devuelve el top de productos más vendidos y su recaudación asociada."""
    orders = _filter_orders_by_date(db, date_from, date_to)
    order_ids = [o.id for o in orders]

    if not order_ids:
        return []

    results = (
        db.query(
            Product.name,
            func.sum(OrderItem.quantity).label("total_qty"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("total_rev")
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .filter(OrderItem.order_id.in_(order_ids))
        .group_by(Product.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
        .all()
    )

    return [
        TopProductResponse(
            product_name=row[0],
            total_quantity=int(row[1]),
            total_revenue=float(row[2])
        )
        for row in results
    ]


@router.get("/best-selling-day", response_model=BestSellingDayResponse)
def get_best_selling_day(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BestSellingDayResponse:
    """Calcula y devuelve el día de la semana con mayor volumen de ventas."""
    orders = _filter_orders_by_date(db, date_from, date_to)

    python_days_map = {
        0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
        4: "Viernes", 5: "Sábado", 6: "Domingo"
    }

    sales_per_day: Dict[str, float] = {}
    for order in orders:
        day_name = python_days_map[order.created_at.weekday()]
        sales_per_day[day_name] = sales_per_day.get(day_name, 0.0) + order.total_amount

    if not sales_per_day:
        return BestSellingDayResponse(best_selling_day=None, total_revenue=None)

    best_day = max(sales_per_day, key=sales_per_day.get)
    return BestSellingDayResponse(
        best_selling_day=best_day,
        total_revenue=sales_per_day[best_day]
    )