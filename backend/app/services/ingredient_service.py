"""Ingredientes del local, recetas de los productos y consumo de ingredientes de los pedidos."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.session import commit
from app.modules.menu import Ingredient, InvalidRecipeError, Product, ProductIngredient
from app.modules.order import Order, OrderItem, OrderStatus
from app.services.catalog_service import get_admin_product, get_product

# Solo los pedidos finalizados se prepararon y entregaron seguro: son los que consumieron ingredientes.
CONSUMING_STATUS = OrderStatus.COMPLETED.value


@dataclass(frozen=True)
class IngredientUsage:
    ingredient: Ingredient
    products_count: int


@dataclass(frozen=True)
class IngredientConsumption:
    ingredient_id: int
    ingredient_name: str
    unit: str
    total_quantity: float


@dataclass(frozen=True)
class ConsumptionReport:
    completed_orders: int
    items: list[IngredientConsumption]
    # Productos vendidos en el período que no tienen receta: su consumo no figura en el reporte.
    products_without_recipe: list[str]


# --- Lista maestra de ingredientes ------------------------------------------------------------------


def list_ingredients(db: Session) -> list[IngredientUsage]:
    usos = dict(
        db.query(ProductIngredient.ingredient_id, func.count(ProductIngredient.product_id))
        .group_by(ProductIngredient.ingredient_id)
        .all()
    )
    ingredientes = db.query(Ingredient).order_by(func.lower(Ingredient.name)).all()
    return [IngredientUsage(ingredient=i, products_count=usos.get(i.id, 0)) for i in ingredientes]


def _get_ingredient(db: Session, ingredient_id: int) -> Ingredient:
    ingredient = db.get(Ingredient, ingredient_id)
    if ingredient is None:
        raise NotFoundError("Ingrediente no encontrado")
    return ingredient


def _check_unique_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Ingredient).filter(func.lower(Ingredient.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Ingredient.id != exclude_id)
    if query.first() is not None:
        raise ConflictError(f"Ya existe un ingrediente llamado '{name}'.")


def create_ingredient(db: Session, name: str, unit: str) -> IngredientUsage:
    _check_unique_name(db, name)
    ingredient = Ingredient(name=name, unit=unit)
    db.add(ingredient)
    commit(db)
    db.refresh(ingredient)
    return IngredientUsage(ingredient=ingredient, products_count=0)


def update_ingredient(db: Session, ingredient_id: int, name: str, unit: str) -> IngredientUsage:
    """Cambiar la unidad no convierte las cantidades de las recetas: se interpretan en la unidad nueva."""
    ingredient = _get_ingredient(db, ingredient_id)
    _check_unique_name(db, name, exclude_id=ingredient_id)
    ingredient.name = name
    ingredient.unit = unit
    commit(db)
    db.refresh(ingredient)
    return IngredientUsage(ingredient=ingredient, products_count=len(ingredient.used_in_products))


def delete_ingredient(db: Session, ingredient_id: int) -> None:
    ingredient = _get_ingredient(db, ingredient_id)
    ingredient.ensure_can_be_deleted()
    db.delete(ingredient)
    commit(db)


# --- Recetas ------------------------------------------------------------------------------------------


def replace_recipe(db: Session, product_id: int, items: list[tuple[int, float]]) -> Product:
    """Reemplaza la receta del producto. Cada ítem es (ingredient_id, cantidad por unidad de producto)."""
    product = get_product(db, product_id)
    ids = {ingredient_id for ingredient_id, _ in items}
    ingredients = {i.id: i for i in db.query(Ingredient).filter(Ingredient.id.in_(ids))} if ids else {}
    if len(ingredients) != len(ids):
        raise InvalidRecipeError("Algún ingrediente de la receta no existe. Actualizá la página e intentá nuevamente.")

    product.replace_recipe([(ingredients[ingredient_id], quantity) for ingredient_id, quantity in items])
    commit(db)
    return get_admin_product(db, product_id)


# --- Consumo ------------------------------------------------------------------------------------------


def _completed_orders(query, date_from: datetime | None, date_to: datetime | None):
    query = query.filter(Order.status == CONSUMING_STATUS)
    if date_from is not None:
        query = query.filter(Order.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Order.created_at <= date_to)
    return query


def ingredient_consumption(
    db: Session,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    ingredient_id: int | None = None,
) -> ConsumptionReport:
    """Total de cada ingrediente usado en los pedidos finalizados del período (por fecha de creación).

    Se calcula con las recetas actuales: unidades vendidas de cada producto × cantidad de su receta.
    """
    filtro = _get_ingredient(db, ingredient_id) if ingredient_id is not None else None

    consumo = _completed_orders(
        db.query(
            Ingredient.id,
            Ingredient.name,
            Ingredient.unit,
            func.sum(OrderItem.quantity * ProductIngredient.quantity),
        )
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
        .join(OrderItem, OrderItem.product_id == ProductIngredient.product_id)
        .join(Order, Order.id == OrderItem.order_id),
        date_from,
        date_to,
    )
    if filtro is not None:
        consumo = consumo.filter(Ingredient.id == filtro.id)
    items = [
        IngredientConsumption(ingredient_id=id_, ingredient_name=nombre, unit=unidad, total_quantity=float(total))
        for id_, nombre, unidad, total in consumo.group_by(Ingredient.id, Ingredient.name, Ingredient.unit)
        .order_by(func.lower(Ingredient.name))
        .all()
    ]
    if filtro is not None and not items:
        items = [IngredientConsumption(filtro.id, filtro.name, filtro.unit, 0.0)]

    pedidos = _completed_orders(db.query(func.count(Order.id)), date_from, date_to).scalar() or 0

    sin_receta = _completed_orders(
        db.query(Product.name)
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(~Product.recipe_items.any()),
        date_from,
        date_to,
    )
    return ConsumptionReport(
        completed_orders=pedidos,
        items=items,
        products_without_recipe=sorted({nombre for (nombre,) in sin_receta.distinct().all()}),
    )
