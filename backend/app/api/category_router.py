from fastapi import APIRouter, Depends
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.schemas.catalog_schemas import AdminCategoryResponse, CategoryPayload
from app.services import catalog_service

router = APIRouter()


@router.get("", dependencies=[Depends(get_current_admin)])
def get_categories(
    db: Session = Depends(get_db),
) -> list[AdminCategoryResponse]:
    """Categorías del menú, ordenadas por nombre, con los productos que las forman."""
    return [AdminCategoryResponse.from_model(category) for category in catalog_service.list_categories(db)]


@router.post(
    "",
    status_code=http_status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
def post_category(
    payload: CategoryPayload,
    db: Session = Depends(get_db),
) -> AdminCategoryResponse:
    return AdminCategoryResponse.from_model(
        catalog_service.create_category(db, payload.name, payload.product_ids, payload.sector)
    )


@router.put("/{category_id}", dependencies=[Depends(get_current_admin)])
def put_category(
    category_id: int,
    payload: CategoryPayload,
    db: Session = Depends(get_db),
) -> AdminCategoryResponse:
    """Renombra la categoría y deja en ella exactamente los productos indicados."""
    category = catalog_service.update_category(
        db, category_id, payload.name, payload.product_ids, payload.sector
    )
    return AdminCategoryResponse.from_model(category)


@router.delete(
    "/{category_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
def remove_category(
    category_id: int,
    db: Session = Depends(get_db),
) -> None:
    """Elimina la categoría. Sus productos quedan sin categoría hasta que se les asigne otra."""
    catalog_service.delete_category(db, category_id)
