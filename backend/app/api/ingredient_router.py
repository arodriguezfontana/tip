from fastapi import APIRouter, Depends
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.ingredient_schemas import IngredientPayload, IngredientResponse
from app.services import ingredient_service

router = APIRouter()


@router.get("", response_model=list[IngredientResponse])
def get_ingredients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[IngredientResponse]:
    """Lista maestra de ingredientes del local, ordenada por nombre."""
    return [IngredientResponse.from_usage(usage) for usage in ingredient_service.list_ingredients(db)]


@router.post("", response_model=IngredientResponse, status_code=http_status.HTTP_201_CREATED)
def post_ingredient(
    payload: IngredientPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> IngredientResponse:
    return IngredientResponse.from_usage(ingredient_service.create_ingredient(db, payload.name, payload.unit))


@router.put("/{ingredient_id}", response_model=IngredientResponse)
def put_ingredient(
    ingredient_id: int,
    payload: IngredientPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> IngredientResponse:
    usage = ingredient_service.update_ingredient(db, ingredient_id, payload.name, payload.unit)
    return IngredientResponse.from_usage(usage)


@router.delete("/{ingredient_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def remove_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> None:
    """Elimina un ingrediente que no figure en ninguna receta."""
    ingredient_service.delete_ingredient(db, ingredient_id)
