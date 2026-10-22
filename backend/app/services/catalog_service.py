"""Catálogo del local: productos (con su imagen) y categorías del menú, para el panel y para los clientes."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.session import transaction
from app.models.menu import Category, Product, ProductImage
from app.repositories import category_repository, product_repository


@dataclass(frozen=True)
class ProductData:
    name: str
    description: str
    price: float
    category_id: int
    is_active: bool
    dietary_restrictions: list[str]


# --- Consultas ----------------------------------------------------------------------------------------


def list_available_products(db: Session) -> list[Product]:
    """Menú para los clientes (web y chatbot): productos disponibles, agrupados por categoría."""
    return product_repository.list_available(db)


def find_available_products_by_name(db: Session, name: str) -> list[Product]:
    """Productos disponibles que corresponden a un nombre escrito por el cliente.

    Si alguno se llama exactamente así (sin distinguir mayúsculas) es el único resultado. Si no, se
    devuelven todos los que lo contienen, para que quien llama pueda pedir que se aclare.
    """
    exact = product_repository.find_available_by_exact_name(db, name)
    return [exact] if exact is not None else product_repository.find_available_containing(db, name)


def list_admin_products(db: Session) -> list[Product]:
    """Todos los productos (también los no disponibles) con su categoría, receta e imagen."""
    return product_repository.list_with_admin_details(db)


def get_admin_product(db: Session, product_id: int) -> Product:
    product = product_repository.get_with_admin_details(db, product_id)
    if product is None:
        raise NotFoundError("Producto no encontrado")
    return product


def get_product(db: Session, product_id: int) -> Product:
    product = product_repository.get(db, product_id)
    if product is None:
        raise NotFoundError("Producto no encontrado")
    return product


def get_product_image(db: Session, product_id: int) -> ProductImage:
    image = product_repository.get_image(db, product_id)
    if image is None:
        raise NotFoundError("El producto no tiene imagen")
    return image


# --- Productos ----------------------------------------------------------------------------------------


def _check_unique_product_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    if product_repository.name_taken(db, name, exclude_id):
        raise ConflictError(f"Ya existe un producto llamado '{name}'.")


def _apply(db: Session, product: Product, data: ProductData) -> None:
    category = category_repository.get(db, data.category_id)
    if category is None:
        raise ConflictError("La categoría elegida no existe. Actualizá la página e intentá nuevamente.")
    product.update_details(
        name=data.name,
        description=data.description,
        price=data.price,
        category=category,
        is_active=data.is_active,
        dietary_restrictions=data.dietary_restrictions,
    )


def create_product(db: Session, data: ProductData) -> Product:
    _check_unique_product_name(db, data.name)
    product = Product()
    with transaction(db):
        _apply(db, product, data)
        product_repository.add(db, product)
    return get_admin_product(db, product.id)


def update_product(db: Session, product_id: int, data: ProductData) -> Product:
    product = get_product(db, product_id)
    _check_unique_product_name(db, data.name, exclude_id=product_id)
    with transaction(db):
        _apply(db, product, data)
    return get_admin_product(db, product_id)


def set_product_image(db: Session, product_id: int, data: bytes) -> Product:
    """Carga o reemplaza la imagen del producto (JPG o PNG, ver ProductImage.content_type_of)."""
    product = get_product(db, product_id)
    with transaction(db):
        product.replace_image(data, now=datetime.now(timezone.utc))
    return get_admin_product(db, product_id)


def delete_product_image(db: Session, product_id: int) -> Product:
    product = get_product(db, product_id)
    with transaction(db):
        product.remove_image()
    return get_admin_product(db, product_id)


# --- Categorías ---------------------------------------------------------------------------------------


def list_categories(db: Session) -> list[Category]:
    return category_repository.list_with_products(db)


def _get_category(db: Session, category_id: int) -> Category:
    category = category_repository.get(db, category_id)
    if category is None:
        raise NotFoundError("Categoría no encontrada")
    return category


def _check_unique_category_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    if category_repository.name_taken(db, name, exclude_id):
        raise ConflictError(f"Ya existe una categoría llamada '{name}'.")


def _products_by_ids(db: Session, product_ids: list[int]) -> list[Product]:
    ids = set(product_ids)
    products = product_repository.get_many(db, ids)
    if len(products) != len(ids):
        raise ConflictError("Algún producto elegido no existe. Actualizá la página e intentá nuevamente.")
    return list(products.values())


def _category_with_products(db: Session, category_id: int) -> Category:
    category = category_repository.get_with_products(db, category_id)
    if category is None:
        raise NotFoundError("Categoría no encontrada")
    return category


def create_category(db: Session, name: str, product_ids: list[int]) -> Category:
    _check_unique_category_name(db, name)
    category = Category(name=name)
    with transaction(db):
        category_repository.add(db, category)
        category.replace_products(_products_by_ids(db, product_ids))
    return _category_with_products(db, category.id)


def update_category(db: Session, category_id: int, name: str, product_ids: list[int]) -> Category:
    category = _get_category(db, category_id)
    _check_unique_category_name(db, name, exclude_id=category_id)
    with transaction(db):
        category.name = name
        category.replace_products(_products_by_ids(db, product_ids))
    return _category_with_products(db, category_id)


def delete_category(db: Session, category_id: int) -> None:
    """Elimina la categoría. Sus productos quedan sin categoría (no se borran)."""
    category = _get_category(db, category_id)
    with transaction(db):
        category.release_products()
        category_repository.delete(db, category)
