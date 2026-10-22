from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import PHONE_PATTERN

# bcrypt solo admite contraseñas de hasta 72 bytes.
PASSWORD_MAX_BYTES = 72


class CustomerProfileUpdate(BaseModel):
    """Datos personales que el cliente guarda en su cuenta para autocompletar sus pedidos."""

    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str = Field(..., min_length=1, max_length=150)
    phone: str = Field(..., min_length=6, max_length=30, pattern=PHONE_PATTERN)
    address: str = Field(..., min_length=1, max_length=255)


class CustomerRegisterRequest(CustomerProfileUpdate):
    email: EmailStr
    password: str = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def _password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
            raise ValueError("La contraseña es demasiado larga.")
        return value


class CustomerProfileResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    phone: str | None
    address: str | None

    model_config = ConfigDict(from_attributes=True)
