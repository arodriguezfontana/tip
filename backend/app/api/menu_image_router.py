from fastapi import APIRouter, Depends, Response
from fastapi import status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.api.uploads import image_body
from app.db.session import get_db
from app.schemas.menu_image_schemas import MenuImageOrder, MenuImagesResponse
from app.schemas.promotion_schemas import MenuLinkUpdate
from app.services import menu_image_service
from app.services.store_config_service import get_or_create_store_config, set_menu_link

router = APIRouter()


def _all(db: Session) -> MenuImagesResponse:
    return MenuImagesResponse.of(menu_image_service.list_menu_images(db))


@router.get("", dependencies=[Depends(get_current_admin)])
def list_menu_images(
    db: Session = Depends(get_db),
) -> MenuImagesResponse:
    """Las imágenes del menú, en el orden en que el bot las manda, para el panel."""
    return _all(db)


@router.get("/config", dependencies=[Depends(get_current_admin)])
def get_menu_config(
    db: Session = Depends(get_db),
) -> dict:
    config = get_or_create_store_config(db)
    return {"menu_link": config.menu_link}


@router.put("/config", dependencies=[Depends(get_current_admin)])
def update_menu_config(
    payload: MenuLinkUpdate,
    db: Session = Depends(get_db),
) -> dict:
    config = set_menu_link(db, payload.menu_link)
    return {"menu_link": config.menu_link}


@router.post(
    "",
    status_code=http_status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
def add_menu_image(
    image: bytes = Depends(image_body),
    db: Session = Depends(get_db),
) -> MenuImagesResponse:
    """Suma una imagen al final del menú (JPG o PNG de hasta 5 MB). El cuerpo es el archivo, sin formulario."""
    menu_image_service.add_menu_image(db, image)
    return _all(db)


# Antes que "/{image_id}" para que "order" no se tome por un id.
@router.put("/order", dependencies=[Depends(get_current_admin)])
def reorder_menu_images(
    order: MenuImageOrder,
    db: Session = Depends(get_db),
) -> MenuImagesResponse:
    """Cambia el orden en que el bot manda las imágenes; hay que indicar todas."""
    menu_image_service.reorder_menu_images(db, order.ids)
    return _all(db)


@router.get("/{image_id}/file", response_class=Response)
def get_menu_image_file(image_id: int, db: Session = Depends(get_db)) -> Response:
    """Endpoint público: una imagen del menú. La URL cambia al reemplazarla, así que se puede cachear."""
    image = menu_image_service.get_required_menu_image(db, image_id)
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.put("/{image_id}", dependencies=[Depends(get_current_admin)])
def replace_menu_image(
    image_id: int,
    image: bytes = Depends(image_body),
    db: Session = Depends(get_db),
) -> MenuImagesResponse:
    """Cambia el contenido de una imagen sin moverla de lugar; el bot manda la nueva desde ese momento."""
    menu_image_service.replace_menu_image(db, image_id, image)
    return _all(db)


@router.delete("/{image_id}", status_code=http_status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_current_admin)])
def delete_menu_image(
    image_id: int,
    db: Session = Depends(get_db),
) -> None:
    menu_image_service.delete_menu_image(db, image_id)
