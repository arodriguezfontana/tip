from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

THEME_COLOR_PATTERN = r"^(black|red|blue|emerald|orange)$"
LOGIN_BG_PATTERN = r"^(bistro|kitchen|trattoria)$"


class StoreConfigResponse(BaseModel):
    id: int
    store_name: str
    address: str | None = None
    opening_hours: str | None = None
    contact_phone: str | None = None
    logo_url: str | None = None
    theme_color: str
    login_bg: str = "bistro"
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StoreConfigUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    store_name: str = Field(..., min_length=1, max_length=100, description="Nombre de la marca o local")
    address: str | None = Field(None, max_length=255, description="Dirección del local")
    opening_hours: str | None = Field(None, max_length=255, description="Días y horarios de atención")
    contact_phone: str | None = Field(None, max_length=100, description="Teléfonos de contacto")
    logo_url: str | None = Field(None, description="Logo principal en formato Data URL o URL")
    theme_color: str = Field("black", pattern=THEME_COLOR_PATTERN, description="Color principal seleccionado")
    login_bg: str = Field("bistro", pattern=LOGIN_BG_PATTERN, description="Fondo de la pantalla de login")

