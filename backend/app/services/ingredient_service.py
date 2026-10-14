"""Ingredientes del local, recetas de los productos y consumo de ingredientes de los pedidos."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.session import transaction
from app.models.menu import Ingredient, InvalidRecipeError, Product
from app.repositories import ingredient_repository
from app.services.catalog_service import get_admin_product, get_product


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
    return [
        IngredientUsage(ingredient=ingredient, products_count=count)
        for ingredient, count in ingredient_repository.list_with_usage(db)
    ]


def _get_ingredient(db: Session, ingredient_id: int) -> Ingredient:
    ingredient = ingredient_repository.get(db, ingredient_id)
    if ingredient is None:
        raise NotFoundError("Ingrediente no encontrado")
    return ingredient


def _check_unique_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    if ingredient_repository.name_taken(db, name, exclude_id):
        raise ConflictError(f"Ya existe un ingrediente llamado '{name}'.")


def create_ingredient(db: Session, name: str, unit: str) -> IngredientUsage:
    _check_unique_name(db, name)
    ingredient = Ingredient(name=name, unit=unit)
    with transaction(db):
        ingredient_repository.add(db, ingredient)
    db.refresh(ingredient)
    return IngredientUsage(ingredient=ingredient, products_count=0)


def update_ingredient(db: Session, ingredient_id: int, name: str, unit: str) -> IngredientUsage:
    """Cambiar la unidad no convierte las cantidades de las recetas: se interpretan en la unidad nueva."""
    ingredient = _get_ingredient(db, ingredient_id)
    _check_unique_name(db, name, exclude_id=ingredient_id)
    with transaction(db):
        ingredient.name = name
        ingredient.unit = unit
    db.refresh(ingredient)
    return IngredientUsage(ingredient=ingredient, products_count=len(ingredient.used_in_products))


def delete_ingredient(db: Session, ingredient_id: int) -> None:
    ingredient = _get_ingredient(db, ingredient_id)
    ingredient.ensure_can_be_deleted()
    with transaction(db):
        ingredient_repository.delete(db, ingredient)


# --- Recetas ------------------------------------------------------------------------------------------


def replace_recipe(db: Session, product_id: int, items: list[tuple[int, float]]) -> Product:
    """Reemplaza la receta del producto. Cada ítem es (ingredient_id, cantidad por unidad de producto)."""
    product = get_product(db, product_id)
    ids = {ingredient_id for ingredient_id, _ in items}
    ingredients = ingredient_repository.get_many(db, ids)
    if len(ingredients) != len(ids):
        raise InvalidRecipeError("Algún ingrediente de la receta no existe. Actualizá la página e intentá nuevamente.")

    with transaction(db):
        product.replace_recipe([(ingredients[ingredient_id], quantity) for ingredient_id, quantity in items])
    return get_admin_product(db, product_id)


# --- Consumo ------------------------------------------------------------------------------------------


def ingredient_consumption(
    db: Session,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    ingredient_id: int | None = None,
) -> ConsumptionReport:
    """Total de cada ingrediente usado en los pedidos finalizados del período (por fecha de creación).

    Se calcula con las recetas actuales: unidades vendidas de cada producto × cantidad de su receta.
    """
    selected = _get_ingredient(db, ingredient_id) if ingredient_id is not None else None

    items = [
        IngredientConsumption(ingredient_id=id_, ingredient_name=name, unit=unit, total_quantity=total)
        for id_, name, unit, total in ingredient_repository.consumption(db, date_from, date_to, ingredient_id)
    ]
    # Si se pidió un ingrediente que no se usó, igual se lo informa (con consumo cero).
    if selected is not None and not items:
        items = [IngredientConsumption(selected.id, selected.name, selected.unit, 0.0)]

    return ConsumptionReport(
        completed_orders=ingredient_repository.count_consuming_orders(db, date_from, date_to),
        items=items,
        products_without_recipe=ingredient_repository.sold_products_without_recipe(db, date_from, date_to),
    )
