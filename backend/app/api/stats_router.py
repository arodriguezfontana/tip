from datetime import datetime
from typing import Dict, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.modules.order import Order
from app.modules.user import User
from app.schemas.stats_schemas import (
    BestSellingDayResponse,
    StatusDistributionResponse,
    TopProductResponse,
)

router = APIRouter()


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
    """Devuelve la distribución de pedidos por su estado."""
    orders = _filter_orders_by_date(db, date_from, date_to)
    
    distribution: Dict[str, int] = {}
    for order in orders:
        status = order.status.strip()
        distribution[status] = distribution.get(status, 0) + 1

    return StatusDistributionResponse(status_distribution=distribution)


@router.get("/top-products", response_model=List[TopProductResponse])
def get_top_products(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(5),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TopProductResponse]:
    """Calcula el top de productos más vendidos a partir de los ítems de las órdenes."""
    orders = _filter_orders_by_date(db, date_from, date_to)
    
    product_stats: Dict[str, Dict[str, float]] = {}

    for order in orders:
        for item in getattr(order, "items", []):
            prod_name = getattr(item, "product_name", None)
            if not prod_name and hasattr(item, "product") and item.product:
                prod_name = getattr(item.product, "name", "Producto desconocido")
            if not prod_name:
                prod_name = f"Producto #{getattr(item, 'product_id', 'N/A')}"

            qty = float(getattr(item, "quantity", 1))
            price = float(getattr(item, "unit_price", 0.0))
            revenue = qty * price

            if prod_name not in product_stats:
                product_stats[prod_name] = {"quantity": 0.0, "revenue": 0.0}
            
            product_stats[prod_name]["quantity"] += qty
            product_stats[prod_name]["revenue"] += revenue

    sorted_products = sorted(
        product_stats.items(),
        key=lambda x: x[1]["quantity"],
        reverse=True
    )[:limit]

    return [
        TopProductResponse(
            product_name=name,
            total_quantity=int(data["quantity"]),
            total_revenue=float(data["revenue"]),
        )
        for name, data in sorted_products
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