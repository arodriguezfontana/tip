from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SECTOR_PATTERN = r"^(cocina|pizzeria|barra)$"


class PrinterConfig(BaseModel):
    """Impresora vinculada a un sector de preparación."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    sector: str = Field(..., pattern=SECTOR_PATTERN, description="Sector de preparación (cocina, pizzeria, barra)")
    name: str = Field(..., min_length=1, max_length=100, description="Nombre para reconocer la impresora")
    host: str = Field(..., min_length=1, max_length=255, description="IP o nombre de red de la impresora")
    port: int = Field(9100, ge=1, le=65535, description="Puerto de impresión (9100 en casi todas las térmicas)")

    @field_validator("host")
    @classmethod
    def _host_without_spaces(cls, value: str) -> str:
        if any(ch.isspace() for ch in value) or "/" in value:
            raise ValueError("La dirección de la impresora no es válida (usá una IP o un nombre, ej. 192.168.1.50).")
        return value


class PrinterConfigUpdate(BaseModel):
    """Reemplaza la configuración completa: los sectores que no vengan quedan sin impresora."""

    printers: list[PrinterConfig] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _unique_sectors(self) -> "PrinterConfigUpdate":
        sectors = [p.sector for p in self.printers]
        if len(sectors) != len(set(sectors)):
            raise ValueError("Un sector no puede tener más de una impresora.")
        return self


class PrinterTestPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(9100, ge=1, le=65535)


class PrintResult(BaseModel):
    """Resultado de mandar una comanda a imprimir. Si `success` es falso, `errors` dice qué impresoras fallaron."""

    success: bool
    message: str | None = None
    errors: list[str] = Field(default_factory=list)
