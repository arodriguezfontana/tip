from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PHONE_PATTERN


class DeliveryDriverBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=150)
    phone: str = Field(..., min_length=6, max_length=30, pattern=PHONE_PATTERN)


class DeliveryDriverCreate(DeliveryDriverBase):
    is_active: bool = True


class DeliveryDriverUpdate(DeliveryDriverBase):
    is_active: bool = True


class DeliveryDriverResponse(BaseModel):
    id: int
    name: str
    phone: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderAssignDriverPayload(BaseModel):
    delivery_driver_id: int | None = None


class TripOrderResponse(BaseModel):
    id: int
    shift_number: int
    customer_name: str
    shipping_address: str
    payment_method: str | None
    total_amount: float
    status: str

    model_config = ConfigDict(from_attributes=True)


class TripSummaryResponse(BaseModel):
    id: int
    dispatched_at: datetime
    finished_at: datetime | None
    is_in_progress: bool
    stops_count: int
    orders: list[TripOrderResponse]

    model_config = ConfigDict(from_attributes=True)


class DriverActivityResponse(BaseModel):
    trips_count: int
    delivered_orders_count: int
    cash_to_hand_over: float
    trips: list[TripSummaryResponse]

    model_config = ConfigDict(from_attributes=True)
