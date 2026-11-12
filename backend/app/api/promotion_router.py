from fastapi import APIRouter, Depends, Response
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.api.uploads import image_body
from app.db.session import get_db
from app.schemas.promotion_schemas import (
    PromotionCreate,
    PromotionResponse,
    PromotionsLinkUpdate,
    PromotionUpdate,
)
from app.services import promotion_service
from app.services.store_config_service import get_or_create_store_config, set_promotions_link

router = APIRouter()


@router.get("", dependencies=[Depends(get_current_admin)])
def list_promotions(
    db: Session = Depends(get_db),
) -> list[PromotionResponse]:
    """Lista todas las promociones para el panel de administración."""
    return [PromotionResponse.from_model(p) for p in promotion_service.list_promotions(db)]


@router.get("/available")
def list_available_promotions(db: Session = Depends(get_db)) -> list[PromotionResponse]:
    """Endpoint público: promociones activas y disponibles para pedir desde la web o consultar en el bot."""
    return [PromotionResponse.from_model(p) for p in promotion_service.list_available_promotions(db)]


@router.get("/config", dependencies=[Depends(get_current_admin)])
def get_promotions_config(
    db: Session = Depends(get_db),
) -> dict:
    config = get_or_create_store_config(db)
    return {"promotions_link": config.promotions_link}


@router.put("/config", dependencies=[Depends(get_current_admin)])
def update_promotions_config(
    payload: PromotionsLinkUpdate,
    db: Session = Depends(get_db),
) -> dict:
    config = set_promotions_link(db, payload.promotions_link)
    return {"promotions_link": config.promotions_link}


@router.post(
    "",
    status_code=http_status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
def create_promotion(
    payload: PromotionCreate,
    db: Session = Depends(get_db),
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


@router.get("/{promotion_id}", dependencies=[Depends(get_current_admin)])
def get_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
) -> PromotionResponse:
    return PromotionResponse.from_model(promotion_service.get_required_promotion(db, promotion_id))


@router.put("/{promotion_id}", dependencies=[Depends(get_current_admin)])
def update_promotion(
    promotion_id: int,
    payload: PromotionUpdate,
    db: Session = Depends(get_db),
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


@router.delete(
    "/{promotion_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
def delete_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
) -> None:
    promotion_service.delete_promotion(db, promotion_id)


@router.put("/{promotion_id}/image", dependencies=[Depends(get_current_admin)])
def put_promotion_image(
    promotion_id: int,
    db: Session = Depends(get_db),
    image: bytes = Depends(image_body),
) -> PromotionResponse:
    """Carga o reemplaza la foto de la promoción (JPG o PNG)."""
    return PromotionResponse.from_model(promotion_service.set_promotion_image(db, promotion_id, image))


@router.delete("/{promotion_id}/image", dependencies=[Depends(get_current_admin)])
def remove_promotion_image(
    promotion_id: int,
    db: Session = Depends(get_db),
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
