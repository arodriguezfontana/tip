"""WhatsApp Business Platform (Cloud API oficial de Meta)."""

import logging
from typing import ClassVar

import httpx

from app.core.channels import Channel
from app.core.config import settings
from app.services.channels.base import CanalDeMensajeria, ClienteHttpCompartido

logger = logging.getLogger(__name__)

# Tope de chats de los que se recuerda el último mensaje recibido (hace falta para el aviso "escribiendo...").
MAX_MENSAJES_RECORDADOS = 1000


def _destinatario(telefono: str) -> str:
    """Número al que se le envía. Los celulares argentinos llegan como 549... pero Meta los registra como 54...

    Responder a "549..." falla con el error 131030 (número fuera de la lista permitida), así que se saca el 9.
    """
    if telefono.startswith("549") and len(telefono) == 13:
        return "54" + telefono[3:]
    return telefono


class WhatsAppChannel(CanalDeMensajeria):
    canal: ClassVar[Channel] = Channel.WHATSAPP
    # El aviso de escritura de WhatsApp dura hasta 25 s o hasta que se envía la respuesta: no hace falta renovarlo seguido.
    segundos_entre_avisos_de_escritura: ClassVar[float] = 20

    def __init__(self) -> None:
        self._cliente = ClienteHttpCompartido()
        self._ultimo_mensaje_recibido: dict[str, str] = {}

    @property
    def _url(self) -> str:
        return f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"

    @property
    def _credenciales_completas(self) -> bool:
        return bool(settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)

    async def _enviar(self, payload: dict, timeout: float | None = None) -> None:
        headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}
        extra = {} if timeout is None else {"timeout": timeout}
        response = await self._cliente().post(
            self._url, json={"messaging_product": "whatsapp", **payload}, headers=headers, **extra
        )
        if response.is_error:
            # Meta explica el motivo en el cuerpo (ej. número fuera de la lista de prueba, token vencido).
            logger.error("WhatsApp respondió %s: %s", response.status_code, response.text)
        response.raise_for_status()

    def recordar_mensaje_recibido(self, chat_id: str, message_id: str) -> None:
        """La API pide el id del último mensaje del cliente para mostrar "escribiendo..." como respuesta a él."""
        self._ultimo_mensaje_recibido.pop(chat_id, None)
        self._ultimo_mensaje_recibido[chat_id] = message_id
        while len(self._ultimo_mensaje_recibido) > MAX_MENSAJES_RECORDADOS:
            del self._ultimo_mensaje_recibido[next(iter(self._ultimo_mensaje_recibido))]

    async def enviar_mensaje(self, chat_id: str, texto: str) -> None:
        if not self._credenciales_completas:
            logger.error("WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no están configurados.")
            return

        self._ultimo_mensaje_recibido.pop(chat_id, None)
        payload = {"recipient_type": "individual", "to": _destinatario(chat_id), "type": "text", "text": {"body": texto}}
        try:
            await self._enviar(payload)
        except httpx.HTTPError as e:
            logger.error("Error al enviar mensaje a WhatsApp: %s", e)

    async def enviar_escribiendo(self, chat_id: str) -> None:
        message_id = self._ultimo_mensaje_recibido.get(chat_id)
        if not self._credenciales_completas or message_id is None:
            return

        # Marca el mensaje como leído y, de paso, muestra "escribiendo...".
        payload = {"status": "read", "message_id": message_id, "typing_indicator": {"type": "text"}}
        try:
            await self._enviar(payload, timeout=10.0)
        except httpx.HTTPError as e:
            logger.warning("No se pudo enviar el indicador de escritura a WhatsApp: %s", e)

    async def registrar_webhook(self) -> None:
        # WhatsApp no permite registrar el webhook por API: se configura a mano en el panel de Meta.
        logger.info("WhatsApp: el webhook se configura en el panel de Meta (ver backend/docs/whatsapp.md).")
