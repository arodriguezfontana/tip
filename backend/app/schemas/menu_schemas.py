from pydantic import BaseModel, ConfigDict, Field


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

    model_config = ConfigDict(from_attributes=True)
