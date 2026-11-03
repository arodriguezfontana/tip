from fastapi import APIRouter, Depends, Response
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.api.uploads import image_body
from app.db.session import get_db, transaction
from app.models.user import User
from app.schemas.promotion_schemas import (
    PromotionCreate,
    PromotionResponse,
    PromotionsLinkUpdate,
    PromotionUpdate,
)
from app.services import promotion_service
from app.services.store_config_service import get_or_create_store_config

router = APIRouter()


@router.get("", response_model=list[PromotionResponse])
def list_promotions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[PromotionResponse]:
    """Lista todas las promociones para el panel de administración."""
    return [PromotionResponse.from_model(p) for p in promotion_service.list_promotions(db)]


@router.get("/available", response_model=list[PromotionResponse])
def list_available_promotions(db: Session = Depends(get_db)) -> list[PromotionResponse]:
    """Endpoint público: promociones activas y disponibles para pedir desde la web o consultar en el bot."""
    return [PromotionResponse.from_model(p) for p in promotion_service.list_available_promotions(db)]


@router.get("/config")
def get_promotions_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> dict:
    config = get_or_create_store_config(db)
    return {"promotions_link": config.promotions_link}


@router.put("/config")
def update_promotions_config(
    payload: PromotionsLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> dict:
    config = get_or_create_store_config(db)
    with transaction(db):
        config.promotions_link = payload.promotions_link
    db.refresh(config)
    return {"promotions_link": config.promotions_link}


@router.post("", response_model=PromotionResponse, status_code=http_status.HTTP_201_CREATED)
def create_promotion(
    payload: PromotionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionResponse:
    """Crea una nueva promoción con sus productos incluidos."""
    promo = promotion_service.create_promotion(
        db=db,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        is_active=payload.is_active,
        items=payload.items,
        image_url=payload.image_url,
    )
    return PromotionResponse.from_model(promo)


@router.get("/{promotion_id}", response_model=PromotionResponse)
def get_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionResponse:
    return PromotionResponse.from_model(promotion_service.get_required_promotion(db, promotion_id))


@router.put("/{promotion_id}", response_model=PromotionResponse)
def update_promotion(
    promotion_id: int,
    payload: PromotionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionResponse:
    promo = promotion_service.update_promotion(
        db=db,
        promotion_id=promotion_id,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        is_active=payload.is_active,
        items=payload.items,
        image_url=payload.image_url,
    )
    return PromotionResponse.from_model(promo)


@router.delete("/{promotion_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> None:
    promotion_service.delete_promotion(db, promotion_id)


@router.put("/{promotion_id}/image", response_model=PromotionResponse)
def put_promotion_image(
    promotion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    image: bytes = Depends(image_body),
) -> PromotionResponse:
    """Carga o reemplaza la foto de la promoción (JPG o PNG)."""
    return PromotionResponse.from_model(promotion_service.set_promotion_image(db, promotion_id, image))


@router.delete("/{promotion_id}/image", response_model=PromotionResponse)
def remove_promotion_image(
    promotion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PromotionResponse:
    """Elimina la foto de la promoción."""
    return PromotionResponse.from_model(promotion_service.delete_promotion_image(db, promotion_id))


@router.get("/{promotion_id}/image", response_class=Response)
def get_promotion_image(promotion_id: int, db: Session = Depends(get_db)) -> Response:
    """Endpoint público: devuelve la imagen de la promoción para mostrarla en la web."""
    photo = promotion_service.get_promotion_image(db, promotion_id)
    return Response(
        content=photo.data,
        media_type=photo.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


