from pydantic import BaseModel, ConfigDict
from typing import Dict, List

class StatusDistributionResponse(BaseModel):
    status_distribution: Dict[str, int]
    model_config = ConfigDict(from_attributes=True)

class TopProductResponse(BaseModel):
    product_name: str
    total_quantity: int
    total_revenue: float
    model_config = ConfigDict(from_attributes=True)

class BestSellingDayResponse(BaseModel):
    best_selling_day: str | None
    total_revenue: float | None
    model_config = ConfigDict(from_attributes=True)