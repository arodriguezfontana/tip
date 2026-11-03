import logging

from app.core.channels import Channel
from app.core.config import settings
from app.services.channels.base import CanalDeMensajeria
from app.services.channels.telegram import TelegramChannel
from app.services.channels.whatsapp import WhatsAppChannel

logger = logging.getLogger(__name__)

_CANALES: dict[Channel, CanalDeMensajeria] = {
    Channel.TELEGRAM: TelegramChannel(),
    Channel.WHATSAPP: WhatsAppChannel(),
}


def obtener_canal(canal: Channel | str) -> CanalDeMensajeria:
    return _CANALES[Channel(canal)]


async def enviar_mensaje(canal: Channel | str | None, chat_id: str | None, texto: str) -> None:
    """Envía un mensaje al chat de un cliente por el canal por el que habló. Reutilizable fuera del flujo del bot."""
    if not canal or not chat_id:
        logger.warning("No se puede enviar el mensaje: falta el canal (%r) o el chat (%r).", canal, chat_id)
        return
    await obtener_canal(canal).enviar_mensaje(chat_id, texto)


async def registrar_webhooks() -> None:
    """Al levantar la API, deja registrados los webhooks de los canales habilitados."""
    for canal in settings.canales_habilitados:
        await obtener_canal(canal).registrar_webhook()
