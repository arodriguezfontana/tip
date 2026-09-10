from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

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
    created_at: datetime
    item_count: int

    model_config = ConfigDict(from_attributes=True)

class OrderStatusUpdate(BaseModel):
    status: OrderStatusLiteral