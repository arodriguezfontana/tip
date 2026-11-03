import asyncio
import logging
from typing import ClassVar

import httpx

from app.core.channels import Channel
from app.core.config import settings
from app.services.channels.base import CanalDeMensajeria, ClienteHttpCompartido, ImagenParaEnviar

logger = logging.getLogger(__name__)


class TelegramChannel(CanalDeMensajeria):
    canal: ClassVar[Channel] = Channel.TELEGRAM
    # Telegram muestra "escribiendo..." durante 5 segundos o menos por aviso: se renueva con margen.
    segundos_entre_avisos_de_escritura: ClassVar[float] = 3

    def __init__(self) -> None:
        self._cliente = ClienteHttpCompartido()

    @staticmethod
    def _destino(chat_id: str) -> int | None:
        try:
            return int(chat_id)
        except ValueError:
            logger.error("chat_id de Telegram inválido: %r", chat_id)
            return None

    async def enviar_mensaje(self, chat_id: str, texto: str) -> None:
        if not settings.TELEGRAM_TOKEN:
            logger.error("TELEGRAM_TOKEN no está configurado.")
            return
        destino = self._destino(chat_id)
        if destino is None:
            return

        url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendMessage"
        try:
            response = await self._cliente().post(url, json={"chat_id": destino, "text": texto})
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Error al enviar mensaje a Telegram: %s", e)

    async def enviar_escribiendo(self, chat_id: str) -> None:
        if not settings.TELEGRAM_TOKEN:
            return
        destino = self._destino(chat_id)
        if destino is None:
            return

        url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendChatAction"
        try:
            response = await self._cliente().post(
                url, json={"chat_id": destino, "action": "typing"}, timeout=10.0
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning("No se pudo enviar el indicador de escritura a Telegram: %s", e)

    async def enviar_imagen(self, chat_id: str, imagen: ImagenParaEnviar, pie: str) -> bool:
        destino = self._destino(chat_id)
        if not settings.TELEGRAM_TOKEN or destino is None:
            return False

        datos = await asyncio.to_thread(imagen.cargar)
        extension = "png" if imagen.content_type == "image/png" else "jpg"
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendPhoto"
        try:
            response = await self._cliente().post(
                url,
                data={"chat_id": str(destino), **({"caption": pie} if pie else {})},
                files={"photo": (f"menu.{extension}", datos, imagen.content_type)},
            )
            response.raise_for_status()
            return True
        except httpx.HTTPError as e:
            logger.error("Error al enviar la imagen a Telegram: %s", e)
            return False

    async def registrar_webhook(self) -> None:
        """Apunta el webhook del bot a PUBLIC_URL. Si falla, la API levanta igual."""
        if not settings.PUBLIC_URL or not settings.TELEGRAM_TOKEN:
            logger.info("PUBLIC_URL no configurada: no se registra el webhook de Telegram.")
            return

        base_url = settings.PUBLIC_URL.strip().rstrip("/")
        if not base_url.startswith(("http://", "https://")):
            base_url = f"https://{base_url}"
        webhook_url = f"{base_url}{settings.API_V1_STR}/telegram/webhook"
        payload = {"url": webhook_url, "secret_token": settings.telegram_webhook_secret}

        url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/setWebhook"
        try:
            async with httpx.AsyncClient(timeout=10.0) as cliente:
                response = await cliente.post(url, json=payload)
                response.raise_for_status()
            logger.info("Webhook de Telegram registrado en %s", webhook_url)
        except httpx.HTTPError as e:
            logger.error("No se pudo registrar el webhook de Telegram: %s", e)
