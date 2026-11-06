from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class BusinessGoalItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    period_type: str = Field(..., description="Tipo de período: 'monthly', 'weekly', 'daily'")
    target_revenue: float = Field(..., ge=0, description="Meta de facturación para el período")
    target_orders: int = Field(..., ge=0, description="Meta de cantidad de pedidos para el período")
    updated_at: datetime | None = None


class BusinessGoalsResponse(BaseModel):
    goals: list[BusinessGoalItem]


class UpdateBusinessGoalsPayload(BaseModel):
    goals: list[BusinessGoalItem]


class GrowthMetric(BaseModel):
    current: float
    previous: float
    growth_pct: float | None = None
    trend: str = "neutral"  # 'up', 'down', 'neutral'
    is_positive: bool = True


class GoalProgress(BaseModel):
    period_type: str
    target_revenue: float
    revenue_progress_pct: float
    revenue_remaining: float
    target_orders: int
    orders_progress_pct: float
    orders_remaining: int


class TopProductKpi(BaseModel):
    product_name: str
    total_quantity: int
    total_revenue: float
    estimated_cost: float
    gross_profit: float
    margin_pct: float
    quantity_growth_pct: float | None = None
    revenue_growth_pct: float | None = None


class DashboardKPIsResponse(BaseModel):
    revenue: GrowthMetric
    orders_count: GrowthMetric
    completed_orders_count: int
    average_ticket: GrowthMetric
    cancellation_rate: GrowthMetric
    cogs: GrowthMetric
    gross_profit: GrowthMetric
    gross_margin_pct: float
    goal: GoalProgress | None = None
    best_selling_day: dict[str, Any]
    status_distribution: dict[str, int]
    top_products: list[TopProductKpi]


class OperationalMetricsContext(BaseModel):
    avg_wait_minutes: float = 0.0
    max_wait_minutes: int = 0
    high_wait_count: int = 0
    high_wait_pct: float = 0.0
    peak_hour: int | None = None
    peak_hour_orders: int = 0
    delivery_pct: float = 0.0
    pickup_pct: float = 0.0


class StrategicInsightResponse(BaseModel):
    summary: str
    highlights: list[str]
    warnings: list[str] = Field(default_factory=list, description="Puntos de atención y alertas")
    operational_weaknesses: list[str] = Field(default_factory=list, description="Debilidades operativas detectadas")
    recommendations: list[str]
    operational_metrics: OperationalMetricsContext | None = None
    generated_at: datetime

