from pydantic import BaseModel, ConfigDict


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

    model_config = ConfigDict(from_attributes=True)
