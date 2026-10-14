"""Catálogo del local: productos (con su imagen) y categorías del menú, para el panel y para los clientes."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import ConflictError, NotFoundError
from app.db.session import commit
from app.modules.menu import Category, Product, ProductImage, ProductIngredient


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
    return (
        db.query(Product)
        .options(joinedload(Product.category), selectinload(Product.image))
        .filter(Product.is_available)
        .order_by(Product.category_id, Product.name)
        .all()
    )


def find_available_products_by_name(db: Session, name: str) -> list[Product]:
    """Productos disponibles que corresponden a un nombre escrito por el cliente.

    Si alguno se llama exactamente así (sin distinguir mayúsculas) es el único resultado. Si no, se
    devuelven todos los que lo contienen, para que quien llama pueda pedir que se aclare.
    """
    available = db.query(Product).filter(Product.is_available)
    exact = available.filter(func.lower(Product.name) == name.lower()).first()
    if exact is not None:
        return [exact]
    return available.filter(Product.name.ilike(f"%{name}%")).order_by(Product.name).all()


def _admin_products(db: Session):
    """Productos con todo lo que muestra el panel: categoría, receta e imagen."""
    return db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.recipe_items).joinedload(ProductIngredient.ingredient),
        selectinload(Product.image),
    )


def list_admin_products(db: Session) -> list[Product]:
    """Todos los productos (también los no disponibles); los que no tienen categoría, al final."""
    return _admin_products(db).order_by(Product.category_id.is_(None), Product.category_id, Product.name).all()


def get_admin_product(db: Session, product_id: int) -> Product:
    db.expire_all()
    product = _admin_products(db).filter(Product.id == product_id).first()
    if product is None:
        raise NotFoundError("Producto no encontrado")
    return product


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Producto no encontrado")
    return product


def get_product_image(db: Session, product_id: int) -> ProductImage:
    image = db.get(ProductImage, product_id)
    if image is None:
        raise NotFoundError("El producto no tiene imagen")
    return image


# --- Productos ----------------------------------------------------------------------------------------


def _check_unique_product_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Product).filter(func.lower(Product.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Product.id != exclude_id)
    if query.first() is not None:
        raise ConflictError(f"Ya existe un producto llamado '{name}'.")


def _category_for(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise ConflictError("La categoría elegida no existe. Actualizá la página e intentá nuevamente.")
    return category


def _apply(db: Session, product: Product, data: ProductData) -> None:
    product.update_details(
        name=data.name,
        description=data.description,
        price=data.price,
        category=_category_for(db, data.category_id),
        is_active=data.is_active,
        dietary_restrictions=data.dietary_restrictions,
    )


def create_product(db: Session, data: ProductData) -> Product:
    _check_unique_product_name(db, data.name)
    product = Product()
    _apply(db, product, data)
    db.add(product)
    commit(db)
    return get_admin_product(db, product.id)


def update_product(db: Session, product_id: int, data: ProductData) -> Product:
    product = get_product(db, product_id)
    _check_unique_product_name(db, data.name, exclude_id=product_id)
    _apply(db, product, data)
    commit(db)
    return get_admin_product(db, product_id)


def set_product_image(db: Session, product_id: int, data: bytes) -> Product:
    """Carga o reemplaza la imagen del producto (JPG o PNG, ver ProductImage.content_type_of)."""
    product = get_product(db, product_id)
    product.replace_image(data, now=datetime.now(timezone.utc))
    commit(db)
    return get_admin_product(db, product_id)


def delete_product_image(db: Session, product_id: int) -> Product:
    product = get_product(db, product_id)
    product.remove_image()
    commit(db)
    return get_admin_product(db, product_id)


# --- Categorías ---------------------------------------------------------------------------------------


def list_categories(db: Session) -> list[Category]:
    return db.query(Category).options(selectinload(Category.products)).order_by(func.lower(Category.name)).all()


def _get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("Categoría no encontrada")
    return category


def _check_unique_category_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Category).filter(func.lower(Category.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Category.id != exclude_id)
    if query.first() is not None:
        raise ConflictError(f"Ya existe una categoría llamada '{name}'.")


def _products_by_ids(db: Session, product_ids: list[int]) -> list[Product]:
    ids = set(product_ids)
    products = db.query(Product).filter(Product.id.in_(ids)).all() if ids else []
    if len(products) != len(ids):
        raise ConflictError("Algún producto elegido no existe. Actualizá la página e intentá nuevamente.")
    return products


def _category_with_products(db: Session, category_id: int) -> Category:
    db.expire_all()
    return db.query(Category).options(selectinload(Category.products)).filter(Category.id == category_id).one()


def create_category(db: Session, name: str, product_ids: list[int]) -> Category:
    _check_unique_category_name(db, name)
    category = Category(name=name)
    db.add(category)
    category.replace_products(_products_by_ids(db, product_ids))
    commit(db)
    return _category_with_products(db, category.id)


def update_category(db: Session, category_id: int, name: str, product_ids: list[int]) -> Category:
    category = _get_category(db, category_id)
    _check_unique_category_name(db, name, exclude_id=category_id)
    category.name = name
    category.replace_products(_products_by_ids(db, product_ids))
    commit(db)
    return _category_with_products(db, category_id)


def delete_category(db: Session, category_id: int) -> None:
    """Elimina la categoría. Sus productos quedan sin categoría (no se borran)."""
    category = _get_category(db, category_id)
    category.release_products()
    db.delete(category)
    commit(db)
