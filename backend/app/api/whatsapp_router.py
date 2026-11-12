import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.core.channels import Channel
from app.core.config import settings
from app.services.bot_service import bot_service
from app.services.channels import obtener_canal
from app.services.channels.whatsapp import WhatsAppChannel
from app.services.channels.whatsapp_webhook import MensajeRecibido, mensajes_recibidos, mensajes_salientes

logger = logging.getLogger(__name__)

router = APIRouter()


def _exigir_canal_habilitado() -> None:
    if Channel.WHATSAPP not in settings.canales_habilitados:
        raise HTTPException(status_code=404, detail="El canal de WhatsApp no está habilitado")


def _firma_valida(cuerpo: bytes, firma: str | None) -> bool:
    """Meta firma cada llamada con HMAC-SHA256 del cuerpo, usando la clave secreta de la app."""
    esperada = "sha256=" + hmac.new(settings.WHATSAPP_APP_SECRET.encode(), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(firma or "", esperada)


@router.get("/webhook")
def verificar_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
) -> PlainTextResponse:
    """Verificación inicial: Meta llama una vez al configurar el webhook y espera recibir el `challenge`."""
    _exigir_canal_habilitado()
    if hub_mode != "subscribe" or not hmac.compare_digest(hub_verify_token or "", settings.WHATSAPP_VERIFY_TOKEN):
        raise HTTPException(status_code=403, detail="Token de verificación inválido")
    return PlainTextResponse(hub_challenge or "")


def _atender_mensaje_recibido(canal: object, mensaje: MensajeRecibido) -> None:
    if isinstance(canal, WhatsAppChannel) and mensaje.message_id:
        canal.recordar_mensaje_recibido(mensaje.telefono, mensaje.message_id)
    # En WhatsApp el chat es el teléfono del cliente.
    bot_service.registrar_perfil(Channel.WHATSAPP, mensaje.telefono, mensaje.nombre, telefono=mensaje.telefono)
    if mensaje.texto:
        bot_service.recibir_mensaje(Channel.WHATSAPP, mensaje.telefono, mensaje.texto)
    elif mensaje.audio_id:
        # Se transcribe en segundo plano: Meta espera la confirmación enseguida.
        bot_service.recibir_audio(Channel.WHATSAPP, mensaje.telefono, mensaje.audio_id)


@router.post("/webhook")
async def recibir_mensaje(request: Request, x_hub_signature_256: str | None = Header(default=None)):
    _exigir_canal_habilitado()
    cuerpo = await request.body()
    if not _firma_valida(cuerpo, x_hub_signature_256):
        raise HTTPException(status_code=403, detail="Firma del webhook inválida")

    try:
        data = await request.json()
    except ValueError:
        return {"status": "ok"}

    canal = obtener_canal(Channel.WHATSAPP)
    for mensaje in mensajes_recibidos(data):
        _atender_mensaje_recibido(canal, mensaje)

    for telefono, texto in mensajes_salientes(data):
        # Un empleado respondió desde Meta Business Suite: el bot se pausa en ese chat.
        bot_service.registrar_mensaje_saliente(Channel.WHATSAPP, telefono, texto)

    # Meta reintenta lo que no se confirma con 200 (también llegan avisos de entrega/lectura, que se ignoran).
    return {"status": "ok"}
