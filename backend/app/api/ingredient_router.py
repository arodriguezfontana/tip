from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.menu import Ingredient
from app.modules.user import User
from app.schemas.ingredient_schemas import IngredientPayload, IngredientResponse
from app.services.ingredient_service import (
    IngredientError,
    IngredientNotFoundError,
    create_ingredient,
    delete_ingredient,
    list_ingredients,
    update_ingredient,
)

router = APIRouter()

NOT_FOUND = "Ingrediente no encontrado"


def _to_response(ingredient: Ingredient, products_count: int) -> IngredientResponse:
    return IngredientResponse(
        id=ingredient.id, name=ingredient.name, unit=ingredient.unit, products_count=products_count
    )


@router.get("", response_model=list[IngredientResponse])
def get_ingredients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[IngredientResponse]:
    """Lista maestra de ingredientes del local, ordenada por nombre."""
    return [_to_response(uso.ingredient, uso.products_count) for uso in list_ingredients(db)]


@router.post("", response_model=IngredientResponse, status_code=http_status.HTTP_201_CREATED)
def post_ingredient(
    payload: IngredientPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> IngredientResponse:
    try:
        ingredient = create_ingredient(db, payload.name, payload.unit)
    except IngredientError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_response(ingredient, 0)


@router.put("/{ingredient_id}", response_model=IngredientResponse)
def put_ingredient(
    ingredient_id: int,
    payload: IngredientPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> IngredientResponse:
    try:
        ingredient = update_ingredient(db, ingredient_id, payload.name, payload.unit)
    except IngredientNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    except IngredientError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_response(ingredient, len(ingredient.used_in_products))


@router.delete("/{ingredient_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def remove_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> None:
    """Elimina un ingrediente que no figure en ninguna receta."""
    try:
        delete_ingredient(db, ingredient_id)
    except IngredientNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    except IngredientError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
