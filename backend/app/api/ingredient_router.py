from fastapi import APIRouter, Depends
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.schemas.ingredient_schemas import IngredientPayload, IngredientResponse
from app.services import ingredient_service

router = APIRouter()


@router.get("", dependencies=[Depends(get_current_admin)])
def get_ingredients(
    db: Session = Depends(get_db),
) -> list[IngredientResponse]:
    """Lista maestra de ingredientes del local, ordenada por nombre."""
    return [IngredientResponse.from_usage(usage) for usage in ingredient_service.list_ingredients(db)]


@router.post(
    "",
    status_code=http_status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
def post_ingredient(
    payload: IngredientPayload,
    db: Session = Depends(get_db),
) -> IngredientResponse:
    return IngredientResponse.from_usage(
        ingredient_service.create_ingredient(db, payload.name, payload.unit, payload.extra_price, payload.cost)
    )


@router.put("/{ingredient_id}", dependencies=[Depends(get_current_admin)])
def put_ingredient(
    ingredient_id: int,
    payload: IngredientPayload,
    db: Session = Depends(get_db),
) -> IngredientResponse:
    usage = ingredient_service.update_ingredient(
        db, ingredient_id, payload.name, payload.unit, payload.extra_price, payload.cost
    )
    return IngredientResponse.from_usage(usage)


@router.delete(
    "/{ingredient_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
def remove_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
) -> None:
    """Elimina un ingrediente que no figure en ninguna receta."""
    ingredient_service.delete_ingredient(db, ingredient_id)
