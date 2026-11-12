from pydantic import BaseModel, ConfigDict, Field


class PinVerificationRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    pin: str = Field(..., pattern=r"^\d{4}$", description="Código PIN numérico de 4 dígitos")


class PinVerificationResponse(BaseModel):
    token: str
    expires_in: int = 300
    message: str = "PIN verificado correctamente"


class PinStatusResponse(BaseModel):
    admin_pin_required: bool = True
    admin_blocked: bool = False
    admin_blocked_seconds_remaining: int = 0
    cash_pin_required: bool = False
    cash_blocked: bool = False
    cash_blocked_seconds_remaining: int = 0
