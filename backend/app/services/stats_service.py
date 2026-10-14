"""Estadísticas de ventas del panel: distribución de pedidos por estado, productos más vendidos y mejor día."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.core.time import RESTAURANT_TZ
from app.modules.menu import Product
from app.modules.order import Order, OrderItem

WEEKDAYS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")


@dataclass(frozen=True)
class TopProduct:
    product_name: str
    total_quantity: int
    total_revenue: float


@dataclass(frozen=True)
class BestSellingDay:
    weekday: str | None
    total_revenue: float | None


def _in_period(query: Query, date_from: datetime | None, date_to: datetime | None) -> Query:
    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)
    return query


def status_distribution(db: Session, date_from: datetime | None = None, date_to: datetime | None = None) -> dict[str, int]:
    """Cantidad de pedidos del período en cada estado."""
    rows = _in_period(db.query(Order.status, func.count(Order.id)), date_from, date_to).group_by(Order.status).all()
    return {status: count for status, count in rows}


def top_products(
    db: Session, date_from: datetime | None = None, date_to: datetime | None = None, limit: int = 5
) -> list[TopProduct]:
    """Productos más vendidos del período (por unidades), sin contar los pedidos rechazados."""
    quantity = func.sum(OrderItem.quantity)
    rows = (
        _in_period(
            db.query(Product.name, quantity, func.sum(OrderItem.quantity * OrderItem.unit_price))
            .join(OrderItem, OrderItem.product_id == Product.id)
            .join(Order, Order.id == OrderItem.order_id)
            .filter(Order.is_billable),
            date_from,
            date_to,
        )
        .group_by(Product.id, Product.name)
        .order_by(quantity.desc(), Product.name)
        .limit(limit)
        .all()
    )
    return [TopProduct(product_name=name, total_quantity=int(qty), total_revenue=float(revenue)) for name, qty, revenue in rows]


def _local_weekday(moment: datetime) -> str:
    """Día de la semana en la hora del local: un pedido del lunes a las 22 hs es del lunes, no del martes en UTC."""
    if moment.tzinfo is None:  # SQLite no conserva la zona horaria; la base guarda UTC
        moment = moment.replace(tzinfo=timezone.utc)
    return WEEKDAYS[moment.astimezone(RESTAURANT_TZ).weekday()]


def best_selling_day(db: Session, date_from: datetime | None = None, date_to: datetime | None = None) -> BestSellingDay:
    """Día de la semana con más facturación del período, sin contar los pedidos rechazados.

    El día se calcula en Python porque depende de la zona horaria del local (y cada motor de base la
    maneja distinto); de la base solo se traen la fecha y el total de cada pedido.
    """
    rows = _in_period(db.query(Order.created_at, Order.total_amount).filter(Order.is_billable), date_from, date_to)
    revenue_by_day: dict[str, float] = {}
    for created_at, total in rows:
        day = _local_weekday(created_at)
        revenue_by_day[day] = revenue_by_day.get(day, 0.0) + total

    if not revenue_by_day:
        return BestSellingDay(weekday=None, total_revenue=None)
    best = max(revenue_by_day, key=lambda day: revenue_by_day[day])
    return BestSellingDay(weekday=best, total_revenue=revenue_by_day[best])
