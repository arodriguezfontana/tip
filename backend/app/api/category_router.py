from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.menu import Category
from app.modules.user import User
from app.schemas.catalog_schemas import AdminCategoryResponse, CategoryPayload, CategoryProductResponse
from app.services.catalog_service import (
    CatalogError,
    CategoryNotFoundError,
    create_category,
    delete_category,
    list_categories,
    update_category,
)

router = APIRouter()

NOT_FOUND = "Categoría no encontrada"


def _to_response(category: Category) -> AdminCategoryResponse:
    return AdminCategoryResponse(
        id=category.id,
        name=category.name,
        products=[
            CategoryProductResponse.model_validate(product)
            for product in sorted(category.products, key=lambda p: p.name.lower())
        ],
    )


@router.get("", response_model=list[AdminCategoryResponse])
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[AdminCategoryResponse]:
    """Categorías del menú, ordenadas por nombre, con los productos que las forman."""
    return [_to_response(category) for category in list_categories(db)]


@router.post("", response_model=AdminCategoryResponse, status_code=http_status.HTTP_201_CREATED)
def post_category(
    payload: CategoryPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminCategoryResponse:
    try:
        category = create_category(db, payload.name, payload.product_ids)
    except CatalogError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_response(category)


@router.put("/{category_id}", response_model=AdminCategoryResponse)
def put_category(
    category_id: int,
    payload: CategoryPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> AdminCategoryResponse:
    """Renombra la categoría y deja en ella exactamente los productos indicados."""
    try:
        category = update_category(db, category_id, payload.name, payload.product_ids)
    except CategoryNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    except CatalogError as exc:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=str(exc))
    return _to_response(category)


@router.delete("/{category_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def remove_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> None:
    """Elimina la categoría. Sus productos quedan sin categoría hasta que se les asigne otra."""
    try:
        delete_category(db, category_id)
    except CategoryNotFoundError:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
