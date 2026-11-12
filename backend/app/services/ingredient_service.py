"""Ingredientes del local, recetas de los productos y consumo de ingredientes de los pedidos."""

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.core.text import sin_acentos
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


def create_ingredient(db: Session, name: str, unit: str, extra_price: float = 0.0, cost: float = 0.0) -> IngredientUsage:
    _check_unique_name(db, name)
    ingredient = Ingredient(name=name, unit=unit, extra_price=extra_price, cost=cost)
    with transaction(db):
        ingredient_repository.add(db, ingredient)
    db.refresh(ingredient)
    return IngredientUsage(ingredient=ingredient, products_count=0)


def update_ingredient(db: Session, ingredient_id: int, name: str, unit: str, extra_price: float = 0.0, cost: float = 0.0) -> IngredientUsage:
    """Cambiar la unidad no convierte las cantidades de las recetas: se interpretan en la unidad nueva."""
    ingredient = _get_ingredient(db, ingredient_id)
    _check_unique_name(db, name, exclude_id=ingredient_id)
    with transaction(db):
        ingredient.name = name
        ingredient.unit = unit
        ingredient.extra_price = Decimal(str(extra_price))
        ingredient.cost = Decimal(str(cost))
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


_QUITAR_PEDIDO_DE_EXCLUSION = re.compile(r"^(?:sin|quitale|quitame|sacale|sacame|no\s+le\s+pongas)\s+")


def _removes_ingredient(modification: dict, ingredient_id: int, normalized_name: str) -> bool:
    """La modificación es una exclusión del ingrediente (por su id o por su nombre)."""
    if (modification.get("type") or modification.get("action")) not in ("negative", "remove"):
        return False
    if modification.get("ingredient_id") is not None and modification.get("ingredient_id") == ingredient_id:
        return True
    written_name = sin_acentos(str(modification.get("name") or modification.get("raw") or "").lower())
    excluded = _QUITAR_PEDIDO_DE_EXCLUSION.sub("", written_name).strip(" []")
    return bool(excluded) and (excluded in normalized_name or normalized_name in excluded)


def _is_ingredient_excluded(row: ingredient_repository.ConsumptionRow) -> bool:
    """El cliente pidió el plato sin ese ingrediente: no se descuenta del stock."""
    normalized_name = sin_acentos(row.ingredient_name.lower())
    return any(
        _removes_ingredient(modification, row.ingredient_id, normalized_name)
        for modification in row.item_modifications or []
    )


def _units_used(row: ingredient_repository.ConsumptionRow) -> float:
    """Cantidad del ingrediente que usó el ítem: en una pizza mitad y mitad cada gusto aporta la mitad."""
    is_half_and_half = row.secondary_product_id is not None and row.product_id != row.secondary_product_id
    return float(row.item_quantity) * float(row.recipe_quantity) * (0.5 if is_half_and_half else 1.0)


def consumption_totals(
    db: Session, date_from: datetime | None, date_to: datetime | None, ingredient_id: int | None
) -> list[tuple[int, str, str, float]]:
    """(id, nombre, unidad, total) de cada ingrediente usado en los pedidos finalizados del período, según
    las recetas actuales: unidades vendidas de cada producto × cantidad de su receta,
    excluyendo los ingredientes que fueron quitados por modificaciones negativas."""
    rows = ingredient_repository.consumption_rows(db, date_from, date_to, ingredient_id)
    totals: dict[int, list] = {}
    for row in (row for row in rows if not _is_ingredient_excluded(row)):
        total = totals.setdefault(row.ingredient_id, [row.ingredient_name, row.ingredient_unit, 0.0])
        total[2] += _units_used(row)
    consumed = [
        (ingredient_id, name, unit, round(amount, 4)) for ingredient_id, (name, unit, amount) in totals.items() if amount > 0
    ]
    return sorted(consumed, key=lambda consumption: consumption[1].lower())


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
        for id_, name, unit, total in consumption_totals(db, date_from, date_to, ingredient_id)
    ]
    # Si se pidió un ingrediente que no se usó, igual se lo informa (con consumo cero).
    if selected is not None and not items:
        items = [IngredientConsumption(selected.id, selected.name, selected.unit, 0.0)]

    return ConsumptionReport(
        completed_orders=ingredient_repository.count_consuming_orders(db, date_from, date_to),
        items=items,
        products_without_recipe=ingredient_repository.sold_products_without_recipe(db, date_from, date_to),
    )
