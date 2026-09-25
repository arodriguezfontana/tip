from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

OrderStatusLiteral = Literal[
    "Pendiente", "Confirmado", "En Camino", "Listo para Retirar", "Finalizado", "Rechazado"
]
DeliveryMethodLiteral = Literal["domicilio", "retiro"]

MAX_QUANTITY_PER_ITEM = 20
MAX_ITEMS_PER_ORDER = 30


class OrderResponse(BaseModel):
    id: int
    customer_name: str
    shipping_address: str
    total_amount: float
    status: str
    delivery_method: str
    source: str
    customer_phone: str | None = None
    notes: str | None = None
    estimated_minutes: int | None
    scheduled_for: Optional[datetime] = None
    created_at: datetime
    item_count: int

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdate(BaseModel):
    status: OrderStatusLiteral
    estimated_minutes: int | None = Field(None, gt=0)


class WebOrderItemCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., ge=1)


class WebOrderCreate(BaseModel):
    """Pedido generado desde la web del cliente. Los precios los calcula el backend."""

    model_config = ConfigDict(str_strip_whitespace=True)

    customer_name: str = Field(..., min_length=1, max_length=150)
    customer_phone: str = Field(..., min_length=6, max_length=30, pattern=r"^\+?[0-9\s\-()]+$")
    delivery_method: DeliveryMethodLiteral
    shipping_address: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=500)
    items: list[WebOrderItemCreate] = Field(..., min_length=1, max_length=MAX_ITEMS_PER_ORDER)

    @model_validator(mode="after")
    def _address_required_for_delivery(self) -> "WebOrderCreate":
        if self.delivery_method == "domicilio" and not self.shipping_address:
            raise ValueError("La dirección es obligatoria para envíos a domicilio.")
        return self


class WebOrderItemResponse(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float


class WebOrderCreatedResponse(BaseModel):
    id: int
    status: str
    customer_name: str
    customer_phone: str | None
    delivery_method: str
    shipping_address: str
    notes: str | None
    total_amount: float
    created_at: datetime
    items: list[WebOrderItemResponse]
