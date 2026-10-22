from pydantic import BaseModel, ConfigDict, Field

from app.models.menu import Product


def product_image_url(product: Product) -> str | None:
    """Ruta de la imagen relativa a la API. Lleva la versión para que al reemplazarla no se vea una copia vieja."""
    version = product.image_version
    return None if version is None else f"/menu/products/{product.id}/image?v={version}"


class CategoryResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class ProductResponse(BaseModel):
    id: int
    name: str
    description: str | None
    price: float
    dietary_restrictions: list[str]
    category: CategoryResponse
    image_url: str | None = Field(None, description="Ruta de la imagen relativa a la API, si tiene.")

    @classmethod
    def from_model(cls, product: Product) -> "ProductResponse":
        return cls(
            id=product.id,
            name=product.name,
            description=product.description,
            price=product.price,
            dietary_restrictions=product.dietary_restrictions or [],
            category=CategoryResponse.model_validate(product.category),
            image_url=product_image_url(product),
        )
