from pydantic import BaseModel

from app.services.stats_service import BestSellingDay, TopProduct


class StatusDistributionResponse(BaseModel):
    status_distribution: dict[str, int]


class TopProductResponse(BaseModel):
    product_name: str
    total_quantity: int
    total_revenue: float

    @classmethod
    def from_stat(cls, stat: TopProduct) -> "TopProductResponse":
        return cls(**vars(stat))


class BestSellingDayResponse(BaseModel):
    best_selling_day: str | None
    total_revenue: float | None

    @classmethod
    def from_stat(cls, stat: BestSellingDay) -> "BestSellingDayResponse":
        return cls(best_selling_day=stat.weekday, total_revenue=stat.total_revenue)
