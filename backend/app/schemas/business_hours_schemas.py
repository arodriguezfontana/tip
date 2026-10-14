from datetime import datetime

from pydantic import BaseModel, Field

HOUR_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


class BusinessHoursRange(BaseModel):
    """Franja de atención. Si cierra antes (o a la misma hora) de abrir, termina al día siguiente."""

    day_of_week: int = Field(..., ge=0, le=6, description="0 = lunes ... 6 = domingo.")
    opens_at: str = Field(..., pattern=HOUR_PATTERN, description="Hora de apertura (HH:MM).")
    closes_at: str = Field(..., pattern=HOUR_PATTERN, description="Hora de cierre (HH:MM).")


class BusinessHoursUpdate(BaseModel):
    ranges: list[BusinessHoursRange] = Field(..., max_length=50)


class BusinessHoursStatus(BaseModel):
    """Horarios del local y si en este momento se pueden hacer pedidos."""

    configured: bool
    is_open: bool
    closes_at: datetime | None = None
    next_opening: datetime | None = None
    next_opening_label: str | None = Field(None, description="Ej.: 'hoy a las 20:00' o 'el martes a las 12:00'.")
    ranges: list[BusinessHoursRange]
