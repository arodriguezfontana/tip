from fastapi import APIRouter, Depends, HTTPException, Response, status as http_status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.session import get_db
from app.modules.menu import Product
from app.schemas.menu_schemas import ProductResponse
from app.services.catalog_service import get_product_image

router = APIRouter()


@router.get("/products", response_model=list[ProductResponse])
def list_available_products(db: Session = Depends(get_db)) -> list[Product]:
    """Endpoint público: devuelve los productos disponibles para pedir desde la web del cliente."""
    return (
        db.query(Product)
        .options(joinedload(Product.category), selectinload(Product.image))
        .filter(Product.is_available)
        .order_by(Product.category_id, Product.name)
        .all()
    )


@router.get("/products/{product_id}/image", response_class=Response)
def get_product_image_file(product_id: int, db: Session = Depends(get_db)) -> Response:
    """Endpoint público: la imagen del producto. La URL cambia al reemplazarla, así que se puede cachear."""
    image = get_product_image(db, product_id)
    if image is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="El producto no tiene imagen")
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
