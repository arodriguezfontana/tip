from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PHONE_PATTERN
from app.services.client_service import ClientPage


class ClientUpdatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str = Field(..., min_length=1, max_length=150)
    # Mismo formato que en los pedidos: un teléfono sin dígitos quedaría vacío al normalizarlo.
    phone: str = Field(..., min_length=6, max_length=30, pattern=PHONE_PATTERN)
    address: str | None = Field(None, max_length=255)


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

    @classmethod
    def from_page(cls, page: ClientPage) -> "ClientPaginatedResponse":
        return cls(
            items=[ClientResponse.model_validate(client) for client in page.items],
            total=page.total,
            page=page.page,
            per_page=page.per_page,
            total_pages=page.total_pages,
        )
