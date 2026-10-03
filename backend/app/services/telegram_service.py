import asyncio
import contextlib
import logging
import time
import httpx
from app.core.config import settings
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

# Telegram muestra "escribiendo..." durante 5 segundos o menos por aviso: se renueva con margen.
TYPING_REFRESH_SECONDS = 3

MENSAJE_FALLBACK = (
    "Disculpá, tuve un problema para responderte. ¿Podés intentar de nuevo en un momento?"
)

_cliente: httpx.AsyncClient | None = None
_cliente_loop: asyncio.AbstractEventLoop | None = None


def _cliente_telegram() -> httpx.AsyncClient:
    """Cliente compartido: reutiliza la conexión con Telegram (abrir una por envío sumaba ~0,5-1 s).

    Se asocia al event loop en el que se creó, porque una conexión no puede usarse desde otro loop.
    """
    global _cliente, _cliente_loop
    loop = asyncio.get_running_loop()
    if _cliente is None or _cliente.is_closed or _cliente_loop is not loop:
        _cliente = httpx.AsyncClient(timeout=30.0)
        _cliente_loop = loop
    return _cliente


async def send_telegram_message(chat_id: int, texto: str) -> None:
    """Envía un mensaje a un chat de Telegram. Reutilizable fuera del flujo conversacional."""
    if not settings.TELEGRAM_TOKEN:
        logger.error("TELEGRAM_TOKEN no está configurado.")
        return

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": texto}

    try:
        response = await _cliente_telegram().post(url, json=payload)
        response.raise_for_status()
    except httpx.HTTPError as e:
        logger.error("Error al enviar mensaje a Telegram: %s", e)


async def register_webhook() -> None:
    """Apunta el webhook del bot a PUBLIC_URL. Si falla, la API levanta igual."""
    if not settings.PUBLIC_URL or not settings.TELEGRAM_TOKEN:
        logger.info("PUBLIC_URL no configurada: no se registra el webhook de Telegram.")
        return

    base_url = settings.PUBLIC_URL.strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"
    webhook_url = f"{base_url}{settings.API_V1_STR}/telegram/webhook"
    payload = {"url": webhook_url}
    if settings.TELEGRAM_WEBHOOK_SECRET:
        payload["secret_token"] = settings.TELEGRAM_WEBHOOK_SECRET

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/setWebhook"
    try:
        async with httpx.AsyncClient(timeout=10.0) as cliente:
            response = await cliente.post(url, json=payload)
            response.raise_for_status()
        logger.info("Webhook de Telegram registrado en %s", webhook_url)
    except httpx.HTTPError as e:
        logger.error("No se pudo registrar el webhook de Telegram: %s", e)


async def send_typing_action(chat_id: int) -> None:
    """Muestra "escribiendo..." en el chat. Si falla no pasa nada: es solo un indicador visual."""
    if not settings.TELEGRAM_TOKEN:
        return

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendChatAction"
    try:
        response = await _cliente_telegram().post(
            url, json={"chat_id": chat_id, "action": "typing"}, timeout=10.0
        )
        response.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("No se pudo enviar el indicador de escritura a Telegram: %s", e)


async def _mantener_escribiendo(chat_id: int) -> None:
    while True:
        await send_typing_action(chat_id)
        await asyncio.sleep(TYPING_REFRESH_SECONDS)


class TelegramService:
    def __init__(self):
        self.chat_service = ChatService()

    async def enviar_mensaje(self, chat_id: int, texto: str):
        """Envía la respuesta de la IA de vuelta a Telegram."""
        await send_telegram_message(chat_id, texto)

    async def procesar_y_enviar(self, chat_id: str, mensaje: str):
        """Procesa el mensaje con el ChatService (IA) y despacha la respuesta."""
        inicio = time.perf_counter()
        try:
            indicador = asyncio.create_task(_mantener_escribiendo(int(chat_id)))
            try:
                respuesta_ia = await self.chat_service.obtener_respuesta(
                    mensaje, session_id=chat_id
                )
            finally:
                indicador.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await indicador
            await self.enviar_mensaje(int(chat_id), respuesta_ia)
            logger.info(
                "Mensaje de chat_id=%s respondido en %.1f s", chat_id, time.perf_counter() - inicio
            )
        except Exception:
            logger.exception("Error procesando el mensaje de chat_id=%s", chat_id)
            try:
                await self.enviar_mensaje(int(chat_id), MENSAJE_FALLBACK)
            except Exception:
                logger.exception(
                    "Error enviando el mensaje de fallback a chat_id=%s", chat_id
                )