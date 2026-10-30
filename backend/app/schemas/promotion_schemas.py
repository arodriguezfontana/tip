from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.promotion import MAX_PROMOTION_IMAGES, Promotion, PromotionImage


class PromotionItemPayload(BaseModel):
    product_id: int = Field(..., description="ID del producto incluido")
    quantity: int = Field(1, ge=1, description="Cantidad del producto incluida en la promo")


class PromotionItemResponse(BaseModel):
    product_id: int
    product_name: str
    quantity: int

    model_config = ConfigDict(from_attributes=True)


class PromotionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=150, description="Nombre de la promoción")
    description: str | None = Field(None, description="Descripción de la promoción")
    price: float = Field(..., gt=0, description="Precio de la promoción")
    is_active: bool = Field(True, description="Si la promoción está activa")
    image_url: str | None = Field(None, description="URL o imagen de la promo")
    items: list[PromotionItemPayload] = Field(..., min_length=1, description="Productos incluidos")


class PromotionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=150, description="Nombre de la promoción")
    description: str | None = Field(None, description="Descripción de la promoción")
    price: float = Field(..., gt=0, description="Precio de la promoción")
    is_active: bool = Field(True, description="Si la promoción está activa")
    image_url: str | None = Field(None, description="URL o imagen de la promo")
    items: list[PromotionItemPayload] = Field(..., min_length=1, description="Productos incluidos")


class PromotionResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    price: float
    is_active: bool
    is_available: bool
    image_url: str | None = None
    items: list[PromotionItemResponse]

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, promo: Promotion) -> "PromotionResponse":
        img = None
        if promo.image_version is not None:
            img = f"/promotions/{promo.id}/image?v={promo.image_version}"
        elif promo.image_url:
            img = promo.image_url

        return cls(
            id=promo.id,
            name=promo.name,
            description=promo.description,
            price=float(promo.price),
            is_active=promo.is_active,
            is_available=promo.is_available,
            image_url=img,
            items=[
                PromotionItemResponse(
                    product_id=it.product_id,
                    product_name=it.product.name if it.product else f"Producto #{it.product_id}",
                    quantity=it.quantity,
                )
                for it in promo.items
            ],
        )


class PromotionImageItem(BaseModel):
    id: int
    position: int
    size_bytes: int
    image_url: str
    updated_at: datetime


class PromotionImagesResponse(BaseModel):
    max_images: int
    images: list[PromotionImageItem]

    @classmethod
    def of(cls, images: list[PromotionImage]) -> "PromotionImagesResponse":
        return cls(
            max_images=MAX_PROMOTION_IMAGES,
            images=[
                PromotionImageItem(
                    id=image.id,
                    position=image.position,
                    size_bytes=image.size_bytes,
                    image_url=f"/api/promotion-images/{image.id}/file?v={image.version}",
                    updated_at=image.updated_at,
                )
                for image in images
            ],
        )


class PromotionImageOrder(BaseModel):
    ids: list[int]


class MenuLinkUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    menu_link: str | None = Field(None, description="URL externa del menú")


class PromotionsLinkUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    promotions_link: str | None = Field(None, description="URL externa de promociones")

