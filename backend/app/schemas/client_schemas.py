from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ClientResponse(BaseModel):
    id: int
    phone: str
    full_name: str
    address: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClientPaginatedResponse(BaseModel):
    items: list[ClientResponse]
    total: int
    page: int
    per_page: int
    total_pages: int