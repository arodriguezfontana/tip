from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.menu import Product
from app.modules.user import User
from app.schemas.ingredient_schemas import ProductRecipeResponse, RecipeItemResponse, RecipeUpdate
from app.schemas.menu_schemas import CategoryResponse
from app.services.ingredient_service import (
    IngredientError,
    ProductNotFoundError,
    list_products_with_recipes,
    replace_recipe,
)

router = APIRouter()


def _to_response(product: Product) -> ProductRecipeResponse:
    return ProductRecipeResponse(
        id=product.id,
        name=product.name,
        is_active=product.is_active,
        category=CategoryResponse.model_validate(product.category),
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


@router.get("", response_model=list[ProductRecipeResponse])
def get_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[ProductRecipeResponse]:
    """Todos los productos (también los no disponibles) con su receta, para el panel."""
    return [_to_response(product) for product in list_products_with_recipes(db)]


@router.put("/{product_id}/recipe", response_model=ProductRecipeResponse)
def put_product_recipe(
    product_id: int,
    payload: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> ProductRecipeResponse:
    """Reemplaza la receta del producto: ingredientes y cantidades por unidad de producto."""
    try:
        product = replace_recipe(db, product_id, [(item.ingredient_id, item.quantity) for item in payload.items])
    except ProductNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    except IngredientError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_response(product)
