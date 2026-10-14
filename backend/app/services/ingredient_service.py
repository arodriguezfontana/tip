"""Ingredientes del local, recetas de los productos y consumo de ingredientes de los pedidos."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.modules.menu import Ingredient, Product, ProductIngredient
from app.modules.order import Order, OrderItem

# Solo los pedidos finalizados se prepararon y entregaron seguro: son los que consumieron ingredientes.
COMPLETED_STATUS = "Finalizado"


class IngredientError(ValueError):
    """Operación inválida sobre ingredientes o recetas. El mensaje es para mostrarle al usuario."""


class IngredientNotFoundError(LookupError):
    pass


class ProductNotFoundError(LookupError):
    pass


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
    ingrediente = db.get(Ingredient, ingredient_id)
    if ingrediente is None:
        raise IngredientNotFoundError()
    return ingrediente


def _check_unique_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Ingredient).filter(func.lower(Ingredient.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Ingredient.id != exclude_id)
    if query.first() is not None:
        raise IngredientError(f"Ya existe un ingrediente llamado '{name}'.")


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def create_ingredient(db: Session, name: str, unit: str) -> Ingredient:
    _check_unique_name(db, name)
    ingrediente = Ingredient(name=name, unit=unit)
    db.add(ingrediente)
    _commit(db)
    db.refresh(ingrediente)
    return ingrediente


def update_ingredient(db: Session, ingredient_id: int, name: str, unit: str) -> Ingredient:
    """Cambiar la unidad no convierte las cantidades de las recetas: se interpretan en la unidad nueva."""
    ingrediente = _get_ingredient(db, ingredient_id)
    _check_unique_name(db, name, exclude_id=ingredient_id)
    ingrediente.name = name
    ingrediente.unit = unit
    _commit(db)
    db.refresh(ingrediente)
    return ingrediente


def delete_ingredient(db: Session, ingredient_id: int) -> None:
    ingrediente = _get_ingredient(db, ingredient_id)
    productos = sorted(item.product.name for item in ingrediente.used_in_products)
    if productos:
        raise IngredientError(
            f"No se puede eliminar '{ingrediente.name}' porque forma parte de la receta de: {', '.join(productos)}. "
            "Quitalo primero de esas recetas."
        )
    db.delete(ingrediente)
    _commit(db)


# --- Recetas ------------------------------------------------------------------------------------------


def list_products_with_recipes(db: Session) -> list[Product]:
    return (
        db.query(Product)
        .options(
            joinedload(Product.category),
            joinedload(Product.recipe_items).joinedload(ProductIngredient.ingredient),
        )
        .order_by(Product.category_id, Product.name)
        .all()
    )


def replace_recipe(db: Session, product_id: int, items: list[tuple[int, float]]) -> Product:
    """Reemplaza la receta del producto. Cada ítem es (ingredient_id, cantidad por unidad de producto)."""
    producto = db.get(Product, product_id)
    if producto is None:
        raise ProductNotFoundError()

    ids = [ingredient_id for ingredient_id, _ in items]
    if len(ids) != len(set(ids)):
        raise IngredientError("Un ingrediente figura más de una vez en la receta.")
    if any(cantidad <= 0 for _, cantidad in items):
        raise IngredientError("Las cantidades de la receta deben ser mayores a cero.")
    existentes = {i.id for i in db.query(Ingredient.id).filter(Ingredient.id.in_(ids))}
    if len(existentes) != len(set(ids)):
        raise IngredientError("Algún ingrediente de la receta no existe. Actualizá la página e intentá nuevamente.")

    # Se actualizan las líneas existentes en lugar de recrearlas: comparten la clave (producto, ingrediente).
    actuales = {item.ingredient_id: item for item in producto.recipe_items}
    nuevas = dict(items)
    for ingredient_id, item in actuales.items():
        if ingredient_id not in nuevas:
            producto.recipe_items.remove(item)
    for ingredient_id, cantidad in nuevas.items():
        if ingredient_id in actuales:
            actuales[ingredient_id].quantity = cantidad
        else:
            producto.recipe_items.append(ProductIngredient(ingredient_id=ingredient_id, quantity=cantidad))
    _commit(db)
    db.expire_all()
    return next(p for p in list_products_with_recipes(db) if p.id == product_id)


# --- Consumo ------------------------------------------------------------------------------------------


def _completed_orders(query, date_from: datetime | None, date_to: datetime | None):
    query = query.filter(Order.status == COMPLETED_STATUS)
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
