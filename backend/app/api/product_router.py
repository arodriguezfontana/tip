from fastapi import APIRouter, Depends
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.api.uploads import image_body
from app.db.session import get_db
from app.models.user import User
from app.schemas.catalog_schemas import AdminProductResponse, ProductPayload
from app.schemas.ingredient_schemas import RecipeUpdate
from app.services import catalog_service
from app.services.ingredient_service import replace_recipe

router = APIRouter()

@router.get("", response_model=list[AdminProductResponse])
def get_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[AdminProductResponse]:
    """Todos los productos (también los no disponibles y los sin categoría) con su receta, para el panel."""
    return [AdminProductResponse.from_model(product) for product in catalog_service.list_admin_products(db)]


@router.post("", response_model=AdminProductResponse, status_code=http_status.HTTP_201_CREATED)
def post_product(
    payload: ProductPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    return AdminProductResponse.from_model(catalog_service.create_product(db, payload.to_data()))


@router.put("/{product_id}", response_model=AdminProductResponse)
def put_product(
    product_id: int,
    payload: ProductPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    return AdminProductResponse.from_model(catalog_service.update_product(db, product_id, payload.to_data()))


@router.put("/{product_id}/image", response_model=AdminProductResponse)
def put_product_image(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    # Después de autenticar: no se lee el archivo de quien no puede cargarlo.
    image: bytes = Depends(image_body),
) -> AdminProductResponse:
    """Carga o reemplaza la imagen (JPG o PNG). El cuerpo es el archivo, sin formulario."""
    return AdminProductResponse.from_model(catalog_service.set_product_image(db, product_id, image))


@router.delete("/{product_id}/image", response_model=AdminProductResponse)
def remove_product_image(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    return AdminProductResponse.from_model(catalog_service.delete_product_image(db, product_id))


@router.put("/{product_id}/recipe", response_model=AdminProductResponse)
def put_product_recipe(
    product_id: int,
    payload: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    """Reemplaza la receta del producto: ingredientes y cantidades por unidad de producto."""
    items = [(item.ingredient_id, item.quantity) for item in payload.items]
    return AdminProductResponse.from_model(replace_recipe(db, product_id, items))
