from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.ingredient_schemas import RecipeItemResponse
from app.schemas.menu_schemas import CategoryResponse

MAX_PRICE = 10_000_000
MAX_DIETARY_RESTRICTIONS = 10
MAX_CATEGORY_PRODUCTS = 500


class ProductPayload(BaseModel):
    """Datos de un producto del catálogo, tanto al crearlo como al editarlo."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=150)
    description: str = Field(..., min_length=1, max_length=1000)
    price: float = Field(..., gt=0, le=MAX_PRICE)
    category_id: int = Field(..., gt=0)
    is_active: bool = Field(True, description="Si está disponible para pedir.")
    dietary_restrictions: list[str] = Field(default_factory=list, max_length=MAX_DIETARY_RESTRICTIONS)

    @field_validator("dietary_restrictions")
    @classmethod
    def _limpiar_restricciones(cls, value: list[str]) -> list[str]:
        """Sin vacías ni repetidas (sin distinguir mayúsculas), conservando el orden."""
        vistas: set[str] = set()
        limpias = []
        for restriccion in (r.strip() for r in value):
            if not restriccion:
                continue
            if len(restriccion) > 40:
                raise ValueError("Cada restricción alimentaria puede tener hasta 40 caracteres.")
            if restriccion.lower() not in vistas:
                vistas.add(restriccion.lower())
                limpias.append(restriccion)
        return limpias


class AdminProductResponse(BaseModel):
    """Producto tal como lo ve el panel: incluye los no disponibles, los sin categoría y su receta."""

    id: int
    name: str
    description: str | None
    price: float
    is_active: bool
    dietary_restrictions: list[str]
    category: CategoryResponse | None
    image_url: str | None
    recipe: list[RecipeItemResponse]


class CategoryPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100)
    product_ids: list[int] = Field(
        default_factory=list,
        max_length=MAX_CATEGORY_PRODUCTS,
        description="Productos que forman la categoría. Los que estaban en otra se mueven a esta.",
    )


class CategoryProductResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class AdminCategoryResponse(BaseModel):
    id: int
    name: str
    products: list[CategoryProductResponse]
