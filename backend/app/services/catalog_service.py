"""Catálogo del local: alta y edición de productos (con su imagen) y de las categorías del menú."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.modules.menu import Category, Product, ProductImage
from app.services.ingredient_service import ProductNotFoundError, list_products_with_recipes

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_MB = MAX_IMAGE_BYTES // (1024 * 1024)

# El formato se reconoce por los primeros bytes del archivo, no por su nombre ni por lo que declara el navegador.
_IMAGE_SIGNATURES = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
}


class CatalogError(ValueError):
    """Operación inválida sobre el catálogo. El mensaje es para mostrarle al usuario."""


class CategoryNotFoundError(LookupError):
    pass


class InvalidImageError(ValueError):
    """La imagen no es JPG/PNG o es demasiado pesada. El mensaje es para mostrarle al usuario."""


@dataclass(frozen=True)
class ProductData:
    name: str
    description: str
    price: float
    category_id: int
    is_active: bool
    dietary_restrictions: list[str]


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def _get_product(db: Session, product_id: int) -> Product:
    producto = db.get(Product, product_id)
    if producto is None:
        raise ProductNotFoundError()
    return producto


def _get_category(db: Session, category_id: int) -> Category:
    categoria = db.get(Category, category_id)
    if categoria is None:
        raise CategoryNotFoundError()
    return categoria


def _admin_product(db: Session, product_id: int) -> Product:
    """El producto recién guardado, con todo lo que muestra el panel (categoría, receta e imagen)."""
    db.expire_all()
    return next(p for p in list_products_with_recipes(db) if p.id == product_id)


# --- Productos ----------------------------------------------------------------------------------------


def _check_unique_product_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Product).filter(func.lower(Product.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Product.id != exclude_id)
    if query.first() is not None:
        raise CatalogError(f"Ya existe un producto llamado '{name}'.")


def _apply_product_data(db: Session, producto: Product, data: ProductData) -> None:
    if db.get(Category, data.category_id) is None:
        raise CatalogError("La categoría elegida no existe. Actualizá la página e intentá nuevamente.")
    producto.name = data.name
    producto.description = data.description
    producto.price = data.price
    producto.category_id = data.category_id
    producto.is_active = data.is_active
    producto.dietary_restrictions = data.dietary_restrictions


def create_product(db: Session, data: ProductData) -> Product:
    _check_unique_product_name(db, data.name)
    producto = Product()
    _apply_product_data(db, producto, data)
    db.add(producto)
    _commit(db)
    return _admin_product(db, producto.id)


def update_product(db: Session, product_id: int, data: ProductData) -> Product:
    producto = _get_product(db, product_id)
    _check_unique_product_name(db, data.name, exclude_id=product_id)
    _apply_product_data(db, producto, data)
    _commit(db)
    return _admin_product(db, product_id)


def _image_content_type(data: bytes) -> str:
    if len(data) > MAX_IMAGE_BYTES:
        raise InvalidImageError(f"La imagen no puede pesar más de {MAX_IMAGE_MB} MB.")
    for firma, content_type in _IMAGE_SIGNATURES.items():
        if data.startswith(firma):
            return content_type
    raise InvalidImageError("La imagen tiene que ser un archivo JPG o PNG.")


def set_product_image(db: Session, product_id: int, data: bytes) -> Product:
    """Carga o reemplaza la imagen del producto."""
    producto = _get_product(db, product_id)
    content_type = _image_content_type(data)
    ahora = datetime.now(timezone.utc)
    if producto.image is None:
        producto.image = ProductImage(content_type=content_type, data=data, updated_at=ahora)
    else:
        producto.image.content_type = content_type
        producto.image.data = data
        producto.image.updated_at = ahora
    _commit(db)
    return _admin_product(db, product_id)


def delete_product_image(db: Session, product_id: int) -> Product:
    producto = _get_product(db, product_id)
    producto.image = None
    _commit(db)
    return _admin_product(db, product_id)


def get_product_image(db: Session, product_id: int) -> ProductImage | None:
    return db.get(ProductImage, product_id)


# --- Categorías ---------------------------------------------------------------------------------------


def list_categories(db: Session) -> list[Category]:
    return (
        db.query(Category)
        .options(selectinload(Category.products))
        .order_by(func.lower(Category.name))
        .all()
    )


def _check_unique_category_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Category).filter(func.lower(Category.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Category.id != exclude_id)
    if query.first() is not None:
        raise CatalogError(f"Ya existe una categoría llamada '{name}'.")


def _set_category_products(db: Session, categoria: Category, product_ids: list[int]) -> None:
    """Deja en la categoría exactamente esos productos.

    Un producto pertenece a una sola categoría: si estaba en otra, se mueve. Los que se quitan quedan sin
    categoría (y no se ofrecen) hasta que se les asigne una.
    """
    ids = set(product_ids)
    productos = db.query(Product).filter(Product.id.in_(ids)).all() if ids else []
    if len(productos) != len(ids):
        raise CatalogError("Algún producto elegido no existe. Actualizá la página e intentá nuevamente.")
    for producto in list(categoria.products):
        if producto.id not in ids:
            producto.category = None
    for producto in productos:
        producto.category = categoria


def _category_with_products(db: Session, category_id: int) -> Category:
    db.expire_all()
    return next(c for c in list_categories(db) if c.id == category_id)


def create_category(db: Session, name: str, product_ids: list[int]) -> Category:
    _check_unique_category_name(db, name)
    categoria = Category(name=name)
    db.add(categoria)
    _set_category_products(db, categoria, product_ids)
    _commit(db)
    return _category_with_products(db, categoria.id)


def update_category(db: Session, category_id: int, name: str, product_ids: list[int]) -> Category:
    categoria = _get_category(db, category_id)
    _check_unique_category_name(db, name, exclude_id=category_id)
    categoria.name = name
    _set_category_products(db, categoria, product_ids)
    _commit(db)
    return _category_with_products(db, category_id)


def delete_category(db: Session, category_id: int) -> None:
    """Elimina la categoría. Sus productos quedan sin categoría (no se borran)."""
    categoria = _get_category(db, category_id)
    for producto in list(categoria.products):
        producto.category = None
    db.delete(categoria)
    _commit(db)
