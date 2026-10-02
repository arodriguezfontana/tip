from pydantic import BaseModel, ConfigDict


class ClientResponse(BaseModel):
    id: int
    phone: str
    full_name: str
    address: str | None

    model_config = ConfigDict(from_attributes=True)
