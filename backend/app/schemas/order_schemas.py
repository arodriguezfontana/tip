from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OrderResponse(BaseModel):
    id: int
    customer_name: str
    shipping_address: str
    total_amount: float
    status: str
    created_at: datetime
    item_count: int

    model_config = ConfigDict(from_attributes=True)
