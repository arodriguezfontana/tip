import re
import unicodedata
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.models.menu import Ingredient, Product, ProductIngredient
from app.models.order import Order, OrderItem, OrderStatus
from app.repositories.common import created_between
from app.repositories.common import name_taken as _name_taken

# Solo los pedidos finalizados se prepararon y entregaron seguro: son los que consumieron ingredientes.
_CONSUMING_STATUS = OrderStatus.COMPLETED.value


def add(db: Session, ingredient: Ingredient) -> None:
    db.add(ingredient)


def delete(db: Session, ingredient: Ingredient) -> None:
    db.delete(ingredient)


def get(db: Session, ingredient_id: int) -> Ingredient | None:
    return db.get(Ingredient, ingredient_id)


def get_many(db: Session, ingredient_ids: set[int]) -> dict[int, Ingredient]:
    if not ingredient_ids:
        return {}
    return {i.id: i for i in db.query(Ingredient).filter(Ingredient.id.in_(ingredient_ids))}


def name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    return _name_taken(db, Ingredient, name, exclude_id)


def list_with_usage(db: Session) -> list[tuple[Ingredient, int]]:
    """Cada ingrediente (ordenados por nombre) con la cantidad de productos en cuya receta figura."""
    usage = dict(
        db.query(ProductIngredient.ingredient_id, func.count(ProductIngredient.product_id))
        .group_by(ProductIngredient.ingredient_id)
        .all()
    )
    ingredients = db.query(Ingredient).order_by(func.lower(Ingredient.name)).all()
    return [(ingredient, usage.get(ingredient.id, 0)) for ingredient in ingredients]


# --- Consumo ------------------------------------------------------------------------------------------


def _consuming_orders(query: Query, date_from: datetime | None, date_to: datetime | None) -> Query:
    return created_between(query.filter(Order.status == _CONSUMING_STATUS), date_from, date_to)


def _is_ingredient_excluded(modifications: list[dict] | None, ingredient_id: int, ingredient_name: str) -> bool:
    if not modifications:
        return False
    norm_name = "".join(c for c in unicodedata.normalize("NFD", ingredient_name.lower()) if unicodedata.category(c) != "Mn")
    for mod in modifications:
        m_type = mod.get("type") or mod.get("action")
        if m_type in ("negative", "remove"):
            if mod.get("ingredient_id") is not None and mod.get("ingredient_id") == ingredient_id:
                return True
            raw_m_name = str(mod.get("name") or mod.get("raw") or "").lower()
            m_norm = "".join(c for c in unicodedata.normalize("NFD", raw_m_name) if unicodedata.category(c) != "Mn")
            m_clean = re.sub(r'^(?:sin|quitale|quitame|sacale|sacame|no\s+le\s+pongas)\s+', '', m_norm).strip(' []')
            if m_clean and (m_clean in norm_name or norm_name in m_clean):
                return True
    return False


def consumption(
    db: Session, date_from: datetime | None, date_to: datetime | None, ingredient_id: int | None
) -> list[tuple[int, str, str, float]]:
    """(id, nombre, unidad, total) de cada ingrediente usado en los pedidos finalizados del período, según
    las recetas actuales: unidades vendidas de cada producto × cantidad de su receta,
    excluyendo los ingredientes que fueron quitados por modificaciones negativas."""
    query = _consuming_orders(
        db.query(
            OrderItem.quantity,
            OrderItem.modifications,
            OrderItem.product_id,
            OrderItem.secondary_product_id,
            ProductIngredient.ingredient_id,
            ProductIngredient.quantity,
            Ingredient.id,
            Ingredient.name,
            Ingredient.unit,
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(
            ProductIngredient,
            (ProductIngredient.product_id == OrderItem.product_id)
            | (ProductIngredient.product_id == OrderItem.secondary_product_id),
        )
        .join(Ingredient, Ingredient.id == ProductIngredient.ingredient_id),
        date_from,
        date_to,
    )
    if ingredient_id is not None:
        query = query.filter(Ingredient.id == ingredient_id)

    rows = query.all()

    totals: dict[int, dict] = {}
    for (
        item_qty,
        item_mods,
        p1_id,
        p2_id,
        _pi_ing_id,
        pi_qty,
        ing_id,
        ing_name,
        ing_unit,
    ) in rows:
        if _is_ingredient_excluded(item_mods, ing_id, ing_name):
            continue

        factor = 0.5 if (p2_id is not None and p1_id != p2_id) else 1.0
        used = float(item_qty) * float(pi_qty) * factor

        if ing_id not in totals:
            totals[ing_id] = {"name": ing_name, "unit": ing_unit, "total": 0.0}
        totals[ing_id]["total"] += used

    result = [
        (ing_id, data["name"], data["unit"], round(data["total"], 4))
        for ing_id, data in totals.items()
        if data["total"] > 0
    ]
    result.sort(key=lambda x: x[1].lower())
    return result


def count_consuming_orders(db: Session, date_from: datetime | None, date_to: datetime | None) -> int:
    return _consuming_orders(db.query(func.count(Order.id)), date_from, date_to).scalar() or 0


def sold_products_without_recipe(db: Session, date_from: datetime | None, date_to: datetime | None) -> list[str]:
    """Productos vendidos en el período que no tienen receta (su consumo no se puede calcular)."""
    query = _consuming_orders(
        db.query(Product.name)
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(~Product.recipe_items.any()),
        date_from,
        date_to,
    )
    return sorted({name for (name,) in query.distinct().all()})
