from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.modules.menu import Product
from app.schemas.menu_schemas import ProductResponse

router = APIRouter()


@router.get("/products", response_model=list[ProductResponse])
def list_available_products(db: Session = Depends(get_db)) -> list[Product]:
    """Endpoint público: devuelve los productos disponibles para pedir desde la web del cliente."""
    return (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.is_active.is_(True))
        .order_by(Product.category_id, Product.name)
        .all()
    )
