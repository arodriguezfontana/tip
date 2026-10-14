from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.modules.menu import Ingredient, Product, ProductIngredient
from app.modules.order import Order, OrderItem, OrderStatus
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


def consumption(
    db: Session, date_from: datetime | None, date_to: datetime | None, ingredient_id: int | None
) -> list[tuple[int, str, str, float]]:
    """(id, nombre, unidad, total) de cada ingrediente usado en los pedidos finalizados del período, según
    las recetas actuales: unidades vendidas de cada producto × cantidad de su receta."""
    query = _consuming_orders(
        db.query(Ingredient.id, Ingredient.name, Ingredient.unit, func.sum(OrderItem.quantity * ProductIngredient.quantity))
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
        .join(OrderItem, OrderItem.product_id == ProductIngredient.product_id)
        .join(Order, Order.id == OrderItem.order_id),
        date_from,
        date_to,
    )
    if ingredient_id is not None:
        query = query.filter(Ingredient.id == ingredient_id)
    rows = query.group_by(Ingredient.id, Ingredient.name, Ingredient.unit).order_by(func.lower(Ingredient.name)).all()
    return [(id_, name, unit, float(total)) for id_, name, unit, total in rows]


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
