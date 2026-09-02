import logging
import httpx
from app.core.config import settings
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

MENSAJE_FALLBACK = (
    "Disculpá, tuve un problema para responderte. ¿Podés intentar de nuevo en un momento?"
)


class TelegramService:
    def __init__(self):
        self.chat_service = ChatService()

    async def enviar_mensaje(self, chat_id: int, texto: str):
        """Envía la respuesta de la IA de vuelta a Telegram."""
        if not settings.TELEGRAM_TOKEN:
            logger.error("TELEGRAM_TOKEN no está configurado.")
            return

        url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendMessage"
        payload = {"chat_id": chat_id, "text": texto}

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
            except httpx.HTTPError as e:
                logger.error("Error al enviar mensaje a Telegram: %s", e)

    async def procesar_y_enviar(self, chat_id: str, mensaje: str):
        """Procesa el mensaje con el ChatService (IA) y despacha la respuesta."""
        try:
            respuesta_ia = await self.chat_service.obtener_respuesta(
                mensaje, session_id=chat_id
            )
            await self.enviar_mensaje(int(chat_id), respuesta_ia)
        except Exception:
            logger.exception("Error procesando el mensaje de chat_id=%s", chat_id)
            try:
                await self.enviar_mensaje(int(chat_id), MENSAJE_FALLBACK)
            except Exception:
                logger.exception(
                    "Error enviando el mensaje de fallback a chat_id=%s", chat_id
                )