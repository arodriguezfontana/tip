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

