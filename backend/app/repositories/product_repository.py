from sqlalchemy import func
from sqlalchemy.orm import Query, Session, joinedload, selectinload

from app.models.menu import Product, ProductImage, ProductIngredient
from app.repositories.common import name_taken as _name_taken


def add(db: Session, product: Product) -> None:
    db.add(product)


def get(db: Session, product_id: int) -> Product | None:
    return db.get(Product, product_id)


def get_many(db: Session, product_ids: set[int]) -> dict[int, Product]:
    if not product_ids:
        return {}
    return {product.id: product for product in db.query(Product).filter(Product.id.in_(product_ids))}


def name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    return _name_taken(db, Product, name, exclude_id)


def list_available(db: Session) -> list[Product]:
    """Productos que se ofrecen a los clientes, agrupados por categoría."""
    return (
        db.query(Product)
        .options(joinedload(Product.category), selectinload(Product.image))
        .filter(Product.is_available)
        .order_by(Product.category_id, Product.name)
        .all()
    )


def find_available_by_exact_name(db: Session, name: str) -> Product | None:
    return db.query(Product).filter(Product.is_available, func.lower(Product.name) == name.lower()).first()


def find_available_containing(db: Session, text: str) -> list[Product]:
    return db.query(Product).filter(Product.is_available, Product.name.ilike(f"%{text}%")).order_by(Product.name).all()


def _with_admin_details(db: Session) -> Query:
    """Con todo lo que muestra el panel: categoría, receta e imagen."""
    return db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.recipe_items).joinedload(ProductIngredient.ingredient),
        selectinload(Product.image),
    )


def list_with_admin_details(db: Session) -> list[Product]:
    """Todos los productos; los que no tienen categoría, al final."""
    return (
        _with_admin_details(db)
        .order_by(Product.category_id.is_(None), Product.category_id, Product.name)
        .all()
    )


def get_with_admin_details(db: Session, product_id: int) -> Product | None:
    # Se descarta lo cargado antes para devolver el producto tal como quedó guardado.
    db.expire_all()
    return _with_admin_details(db).filter(Product.id == product_id).first()


def get_image(db: Session, product_id: int) -> ProductImage | None:
    return db.get(ProductImage, product_id)
