from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

OrderStatusLiteral = Literal[
    "Pendiente", "Confirmado", "En Camino", "Listo para Retirar", "Finalizado", "Rechazado"
]


class OrderResponse(BaseModel):
    id: int
    customer_name: str
    shipping_address: str
    total_amount: float
    status: str
    delivery_method: str
    estimated_minutes: int | None
    scheduled_for: Optional[datetime] = None 
    created_at: datetime
    item_count: int

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdate(BaseModel):
    status: OrderStatusLiteral
    estimated_minutes: int | None = Field(None, gt=0)