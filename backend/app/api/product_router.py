from fastapi import APIRouter, Depends, HTTPException, Request, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.menu import Product
from app.modules.user import User
from app.schemas.catalog_schemas import AdminProductResponse, ProductPayload
from app.schemas.ingredient_schemas import RecipeItemResponse, RecipeUpdate
from app.schemas.menu_schemas import CategoryResponse
from app.services.catalog_service import (
    MAX_IMAGE_BYTES,
    MAX_IMAGE_MB,
    CatalogError,
    InvalidImageError,
    ProductData,
    create_product,
    delete_product_image,
    set_product_image,
    update_product,
)
from app.services.ingredient_service import (
    IngredientError,
    ProductNotFoundError,
    list_products_with_recipes,
    replace_recipe,
)

router = APIRouter()

NOT_FOUND = "Producto no encontrado"
IMAGE_TOO_LARGE = f"La imagen no puede pesar más de {MAX_IMAGE_MB} MB."


def _to_response(product: Product) -> AdminProductResponse:
    return AdminProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        price=product.price,
        is_active=product.is_active,
        dietary_restrictions=product.dietary_restrictions or [],
        category=CategoryResponse.model_validate(product.category) if product.category else None,
        image_url=product.image_url,
        recipe=sorted(
            (
                RecipeItemResponse(
                    ingredient_id=item.ingredient_id,
                    ingredient_name=item.ingredient.name,
                    unit=item.ingredient.unit,
                    quantity=item.quantity,
                )
                for item in product.recipe_items
            ),
            key=lambda item: item.ingredient_name.lower(),
        ),
    )


def _product_data(payload: ProductPayload) -> ProductData:
    return ProductData(**payload.model_dump())


async def _image_body(request: Request) -> bytes:
    """El archivo de la imagen viaja tal cual en el cuerpo del pedido. Se corta apenas supera el máximo."""
    declarado = request.headers.get("content-length", "")
    if declarado.isdigit() and int(declarado) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=http_status.HTTP_413_CONTENT_TOO_LARGE, detail=IMAGE_TOO_LARGE)
    contenido = bytearray()
    async for chunk in request.stream():
        contenido += chunk
        if len(contenido) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=http_status.HTTP_413_CONTENT_TOO_LARGE, detail=IMAGE_TOO_LARGE)
    return bytes(contenido)


@router.get("", response_model=list[AdminProductResponse])
def get_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[AdminProductResponse]:
    """Todos los productos (también los no disponibles y los sin categoría) con su receta, para el panel."""
    return [_to_response(product) for product in list_products_with_recipes(db)]


@router.post("", response_model=AdminProductResponse, status_code=http_status.HTTP_201_CREATED)
def post_product(
    payload: ProductPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    try:
        product = create_product(db, _product_data(payload))
    except CatalogError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_response(product)


@router.put("/{product_id}", response_model=AdminProductResponse)
def put_product(
    product_id: int,
    payload: ProductPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    try:
        product = update_product(db, product_id, _product_data(payload))
    except ProductNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    except CatalogError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_response(product)


@router.put("/{product_id}/image", response_model=AdminProductResponse)
def put_product_image(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    # Después de autenticar: no se lee el archivo de quien no puede cargarlo.
    image: bytes = Depends(_image_body),
) -> AdminProductResponse:
    """Carga o reemplaza la imagen (JPG o PNG, hasta 5 MB). El cuerpo es el archivo, sin formulario."""
    try:
        product = set_product_image(db, product_id, image)
    except ProductNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    except InvalidImageError as exc:
        raise HTTPException(status_code=http_status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc))
    return _to_response(product)


@router.delete("/{product_id}/image", response_model=AdminProductResponse)
def remove_product_image(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    try:
        product = delete_product_image(db, product_id)
    except ProductNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return _to_response(product)


@router.put("/{product_id}/recipe", response_model=AdminProductResponse)
def put_product_recipe(
    product_id: int,
    payload: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminProductResponse:
    """Reemplaza la receta del producto: ingredientes y cantidades por unidad de producto."""
    try:
        product = replace_recipe(db, product_id, [(item.ingredient_id, item.quantity) for item in payload.items])
    except ProductNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    except IngredientError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_response(product)
