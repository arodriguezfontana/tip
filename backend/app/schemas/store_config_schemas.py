from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

THEME_COLOR_PATTERN = r"^(black|red|blue|emerald|orange|#[0-9a-fA-F]{6})$"
LOGIN_BG_PATTERN = r"^(bistro|kitchen|trattoria|custom)$"
# Una imagen de fondo ya redimensionada por el navegador pesa bastante menos; esto solo evita abusos.
LOGIN_BG_IMAGE_MAX_LENGTH = 4_000_000


class StoreConfigResponse(BaseModel):
    id: int
    store_name: str
    address: str | None = None
    contact_phone: str | None = None
    logo_url: str | None = None
    theme_color: str
    login_bg: str = "bistro"
    login_bg_image: str | None = None
    mp_alias: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StoreConfigUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    store_name: str = Field(..., min_length=1, max_length=100, description="Nombre de la marca o local")
    address: str | None = Field(None, max_length=255, description="Dirección del local")
    contact_phone: str | None = Field(None, max_length=100, description="Teléfonos de contacto")
    logo_url: str | None = Field(None, description="Logo principal en formato Data URL o URL")
    theme_color: str = Field("black", pattern=THEME_COLOR_PATTERN, description="Color principal seleccionado")
    login_bg: str = Field("bistro", pattern=LOGIN_BG_PATTERN, description="Fondo de la pantalla de login")
    login_bg_image: str | None = Field(
        None,
        max_length=LOGIN_BG_IMAGE_MAX_LENGTH,
        pattern=r"^data:image/",
        description="Imagen propia para el fondo de login, en formato Data URL",
    )
    mp_alias: str | None = Field(None, max_length=100, description="Alias de Mercado Pago")

    @model_validator(mode="after")
    def custom_login_bg_requires_image(self) -> "StoreConfigUpdate":
        if self.login_bg == "custom" and not self.login_bg_image:
            raise ValueError("Para usar un fondo propio hay que subir una imagen.")
        return self

