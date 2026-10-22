from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.menu_schemas import ProductResponse
from app.services import catalog_service

router = APIRouter()


@router.get("/products", response_model=list[ProductResponse])
def list_available_products(db: Session = Depends(get_db)) -> list[ProductResponse]:
    """Endpoint público: devuelve los productos disponibles para pedir desde la web del cliente."""
    return [ProductResponse.from_model(product) for product in catalog_service.list_available_products(db)]


@router.get("/products/{product_id}/image", response_class=Response)
def get_product_image(product_id: int, db: Session = Depends(get_db)) -> Response:
    """Endpoint público: la imagen del producto. La URL cambia al reemplazarla, así que se puede cachear."""
    image = catalog_service.get_product_image(db, product_id)
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
