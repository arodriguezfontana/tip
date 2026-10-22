from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import settings

RESTAURANT_TZ = ZoneInfo(settings.RESTAURANT_TIMEZONE)


def ahora_local() -> datetime:
    """Fecha y hora actual en la zona horaria del local."""
    return datetime.now(RESTAURANT_TZ)
