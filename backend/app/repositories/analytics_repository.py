import collections
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.business_goal import BusinessGoal
from app.models.menu import Ingredient, Product
from app.models.order import Order, OrderStatus
from app.repositories.common import created_between
from app.repositories.ingredient_repository import consumption as ingredient_consumption


# --- Business Goals (Metas) --------------------------------------------------------------------------

DEFAULT_GOALS = [
    {"period_type": "monthly", "target_revenue": Decimal("5000000"), "target_orders": 300},
    {"period_type": "weekly", "target_revenue": Decimal("1250000"), "target_orders": 75},
    {"period_type": "daily", "target_revenue": Decimal("200000"), "target_orders": 15},
]


def list_goals(db: Session) -> list[BusinessGoal]:
    """Obtiene todas las metas comerciales configuradas. Si no existen, inicializa las metas por defecto."""
    goals = db.query(BusinessGoal).all()
    if not goals:
        for default in DEFAULT_GOALS:
            db.add(BusinessGoal(**default))
        db.commit()
        goals = db.query(BusinessGoal).all()
    return goals


def get_goal_by_period(db: Session, period_type: str) -> BusinessGoal | None:
    return db.query(BusinessGoal).filter(BusinessGoal.period_type == period_type).first()


def upsert_goal(
    db: Session, period_type: str, target_revenue: Decimal | float, target_orders: int
) -> BusinessGoal:
    goal = get_goal_by_period(db, period_type)
    if goal is None:
        goal = BusinessGoal(
            period_type=period_type,
            target_revenue=Decimal(str(target_revenue)),
            target_orders=target_orders,
        )
        db.add(goal)
    else:
        goal.target_revenue = Decimal(str(target_revenue))
        goal.target_orders = target_orders
    db.commit()
    db.refresh(goal)
    return goal


# --- Métricas y KPIs de pedidos -----------------------------------------------------------------------


def order_counts_by_status(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> dict[str, int]:
    query = created_between(db.query(Order.status, func.count(Order.id)), date_from, date_to)
    return dict(query.group_by(Order.status).all())


def billable_revenue_and_count(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> tuple[float, int]:
    """(total facturado, cantidad de pedidos facturables) del período."""
    query = created_between(
        db.query(func.coalesce(func.sum(Order.total_amount), 0), func.count(Order.id)).filter(Order.is_billable),
        date_from,
        date_to,
    )
    rev, count = query.one()
    return float(rev or 0), int(count or 0)


def completed_orders_count(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> int:
    query = created_between(
        db.query(func.count(Order.id)).filter(Order.status == OrderStatus.COMPLETED.value),
        date_from,
        date_to,
    )
    return int(query.scalar() or 0)


def calculate_cogs(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> tuple[float, dict[int, float]]:
    """Calcula el costo aproximado de la mercadería vendida (COGS) según el consumo real de ingredientes

    en pedidos completados y el costo unitario de cada ingrediente.
    Retorna (cogs_total, dict_costo_por_ingrediente).
    """
    consumed_items = ingredient_consumption(db, date_from, date_to, ingredient_id=None)
    if not consumed_items:
        return 0.0, {}

    ing_ids = {item[0] for item in consumed_items}
    ingredients = db.query(Ingredient).filter(Ingredient.id.in_(ing_ids)).all()
    cost_map = {ing.id: float(ing.cost or 0) for ing in ingredients}

    total_cogs = 0.0
    for ing_id, _name, _unit, qty in consumed_items:
        unit_cost = cost_map.get(ing_id, 0.0)
        total_cogs += qty * unit_cost

    return round(total_cogs, 2), cost_map


def get_products_unit_cost(db: Session, product_names: list[str]) -> dict[str, float]:
    """Calcula el costo unitario de preparación de cada producto según su receta actual e ingredientes."""
    if not product_names:
        return {}

    products = (
        db.query(Product)
        .filter(Product.name.in_(product_names))
        .all()
    )

    product_unit_cost: dict[str, float] = {}
    for prod in products:
        unit_cost = 0.0
        for item in prod.recipe_items:
            ing_cost = float(item.ingredient.cost or 0) if item.ingredient else 0.0
            unit_cost += float(item.quantity) * ing_cost
        product_unit_cost[prod.name] = round(unit_cost, 2)

    return product_unit_cost


def get_operational_flow_and_wait_times(
    db: Session, date_from: datetime | None, date_to: datetime | None
) -> dict[str, Any]:
    """Calcula métricas operativas de tiempos de espera y flujo de pedidos en el período."""
    orders = created_between(
        db.query(
            Order.id,
            Order.estimated_minutes,
            Order.delivery_method,
            Order.source,
            Order.created_at,
            Order.status,
        ),
        date_from,
        date_to,
    ).all()

    total_orders = len(orders)
    wait_times = [o.estimated_minutes for o in orders if o.estimated_minutes is not None and o.estimated_minutes > 0]
    avg_wait = round(sum(wait_times) / len(wait_times), 1) if wait_times else 0.0
    max_wait = max(wait_times) if wait_times else 0
    high_wait_count = sum(1 for w in wait_times if w >= 45)
    high_wait_pct = round((high_wait_count / len(wait_times) * 100.0), 1) if wait_times else 0.0

    hour_counts = collections.Counter(o.created_at.hour for o in orders if o.created_at)
    if hour_counts:
        peak_hour, peak_hour_orders = hour_counts.most_common(1)[0]
        peak_hour_pct = round((peak_hour_orders / total_orders * 100.0), 1) if total_orders > 0 else 0.0
    else:
        peak_hour, peak_hour_orders, peak_hour_pct = None, 0, 0.0

    delivery_counts = collections.Counter(o.delivery_method for o in orders if o.delivery_method)
    delivery_count = delivery_counts.get("domicilio", 0)
    pickup_count = delivery_counts.get("retiro", 0)
    delivery_pct = round((delivery_count / total_orders * 100.0), 1) if total_orders > 0 else 0.0
    pickup_pct = round((pickup_count / total_orders * 100.0), 1) if total_orders > 0 else 0.0

    sources = dict(collections.Counter(o.source for o in orders if o.source))

    return {
        "total_orders": total_orders,
        "avg_wait_minutes": avg_wait,
        "max_wait_minutes": max_wait,
        "high_wait_count": high_wait_count,
        "high_wait_pct": high_wait_pct,
        "peak_hour": peak_hour,
        "peak_hour_orders": peak_hour_orders,
        "peak_hour_pct": peak_hour_pct,
        "delivery_count": delivery_count,
        "pickup_count": pickup_count,
        "delivery_pct": delivery_pct,
        "pickup_pct": pickup_pct,
        "sources": sources,
    }

