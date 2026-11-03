from fastapi import APIRouter, Depends, Response
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.api.uploads import image_body
from app.db.session import get_db
from app.models.user import User
from app.schemas.promotion_schemas import PromotionImageOrder, PromotionImagesResponse
from app.services import promotion_image_service

router = APIRouter()


def _all(db: Session) -> PromotionImagesResponse:
    return PromotionImagesResponse.of(promotion_image_service.list_promotion_images(db))


@router.get("", response_model=PromotionImagesResponse)
def list_promotion_images(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionImagesResponse:
    """Las imágenes de promociones para el panel de administración."""
    return _all(db)


@router.post("", response_model=PromotionImagesResponse, status_code=http_status.HTTP_201_CREATED)
def add_promotion_image(
    image: bytes = Depends(image_body),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionImagesResponse:
    """Suma una imagen de promoción al final (JPG o PNG de hasta 5 MB)."""
    promotion_image_service.add_promotion_image(db, image)
    return _all(db)


@router.put("/order", response_model=PromotionImagesResponse)
def reorder_promotion_images(
    order: PromotionImageOrder,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionImagesResponse:
    """Cambia el orden de las imágenes de promociones."""
    promotion_image_service.reorder_promotion_images(db, order.ids)
    return _all(db)


@router.get("/{image_id}/file", response_class=Response)
def get_promotion_image_file(image_id: int, db: Session = Depends(get_db)) -> Response:
    """Endpoint público: una imagen de promoción."""
    image = promotion_image_service.get_required_promotion_image(db, image_id)
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.put("/{image_id}", response_model=PromotionImagesResponse)
def replace_promotion_image(
    image_id: int,
    image: bytes = Depends(image_body),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionImagesResponse:
    """Reemplaza una imagen de promoción."""
    promotion_image_service.replace_promotion_image(db, image_id, image)
    return _all(db)


@router.delete("/{image_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_promotion_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> None:
    promotion_image_service.delete_promotion_image(db, image_id)

