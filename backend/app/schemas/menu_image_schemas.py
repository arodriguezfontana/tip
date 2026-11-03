from datetime import datetime

from pydantic import BaseModel

from app.models.menu_image import MAX_MENU_IMAGES, MenuImage


class MenuImageItem(BaseModel):
    id: int
    # Dirección de la imagen (cambia al reemplazarla, así el panel nunca muestra una copia vieja).
    image_url: str
    content_type: str
    size_bytes: int
    updated_at: datetime

    @classmethod
    def of(cls, image: MenuImage) -> "MenuImageItem":
        return cls(
            id=image.id,
            image_url=f"/menu-image/{image.id}/file?v={image.version}",
            content_type=image.content_type,
            size_bytes=image.size_bytes,
            updated_at=image.updated_at,
        )


class MenuImagesResponse(BaseModel):
    """Las imágenes del menú en el orden en que el bot las manda."""

    images: list[MenuImageItem] = []
    max_images: int = MAX_MENU_IMAGES

    @classmethod
    def of(cls, images: list[MenuImage]) -> "MenuImagesResponse":
        return cls(images=[MenuImageItem.of(image) for image in images])


class MenuImageOrder(BaseModel):
    ids: list[int]
