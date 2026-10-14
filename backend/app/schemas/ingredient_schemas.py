from pydantic import BaseModel, ConfigDict, Field

from app.modules.menu import ProductIngredient
from app.services.ingredient_service import ConsumptionReport, IngredientUsage

MAX_RECIPE_ITEMS = 50
MAX_RECIPE_QUANTITY = 100_000


class IngredientPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100)
    unit: str = Field(..., min_length=1, max_length=30, description="Unidad de medida, ej. 'gramos' o 'unidades'.")


class IngredientResponse(BaseModel):
    id: int
    name: str
    unit: str
    products_count: int = Field(..., description="Cantidad de productos en cuya receta figura.")

    @classmethod
    def from_usage(cls, usage: IngredientUsage) -> "IngredientResponse":
        ingredient = usage.ingredient
        return cls(id=ingredient.id, name=ingredient.name, unit=ingredient.unit, products_count=usage.products_count)


class RecipeItemPayload(BaseModel):
    ingredient_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0, le=MAX_RECIPE_QUANTITY, description="Por unidad de producto.")


class RecipeUpdate(BaseModel):
    items: list[RecipeItemPayload] = Field(..., max_length=MAX_RECIPE_ITEMS)


class RecipeItemResponse(BaseModel):
    ingredient_id: int
    ingredient_name: str
    unit: str
    quantity: float

    @classmethod
    def from_model(cls, item: ProductIngredient) -> "RecipeItemResponse":
        return cls(
            ingredient_id=item.ingredient_id,
            ingredient_name=item.ingredient.name,
            unit=item.ingredient.unit,
            quantity=item.quantity,
        )


class IngredientConsumptionItem(BaseModel):
    ingredient_id: int
    ingredient_name: str
    unit: str
    total_quantity: float


class IngredientConsumptionResponse(BaseModel):
    completed_orders: int
    items: list[IngredientConsumptionItem]
    products_without_recipe: list[str]

    @classmethod
    def from_report(cls, report: ConsumptionReport) -> "IngredientConsumptionResponse":
        return cls(
            completed_orders=report.completed_orders,
            items=[IngredientConsumptionItem(**vars(item)) for item in report.items],
            products_without_recipe=report.products_without_recipe,
        )
