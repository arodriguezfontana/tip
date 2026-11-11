from datetime import datetime
from typing import NamedTuple

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


def list_all(db: Session) -> list[Ingredient]:
    return db.query(Ingredient).all()


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
    rows = (
        db.query(ProductIngredient.ingredient_id, func.count(ProductIngredient.product_id))
        .group_by(ProductIngredient.ingredient_id)
        .all()
    )
    usage = {row[0]: row[1] for row in rows}
    ingredients = db.query(Ingredient).order_by(func.lower(Ingredient.name)).all()
    return [(ingredient, usage.get(ingredient.id, 0)) for ingredient in ingredients]


# --- Consumo ------------------------------------------------------------------------------------------


def _consuming_orders(query: Query, date_from: datetime | None, date_to: datetime | None) -> Query:
    return created_between(query.filter(Order.status == _CONSUMING_STATUS), date_from, date_to)


class ConsumptionRow(NamedTuple):
    """Un ítem vendido de un pedido finalizado junto con una línea de la receta de su producto."""

    item_quantity: int
    item_modifications: list[dict] | None
    product_id: int | None
    secondary_product_id: int | None
    recipe_quantity: float
    ingredient_id: int
    ingredient_name: str
    ingredient_unit: str


def consumption_rows(
    db: Session, date_from: datetime | None, date_to: datetime | None, ingredient_id: int | None
) -> list[ConsumptionRow]:
    """Por cada ítem de los pedidos finalizados del período, una fila por ingrediente de la receta de su producto
    (o de los dos productos, si es una pizza mitad y mitad)."""
    query = _consuming_orders(
        db.query(
            OrderItem.quantity,
            OrderItem.modifications,
            OrderItem.product_id,
            OrderItem.secondary_product_id,
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
    return [ConsumptionRow(*row) for row in query.all()]


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
