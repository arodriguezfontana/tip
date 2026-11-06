import hashlib
import hmac
import logging
from dataclasses import dataclass

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.core.channels import Channel
from app.core.config import settings
from app.services.bot_service import bot_service
from app.services.channels import obtener_canal
from app.services.channels.whatsapp import WhatsAppChannel

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


@dataclass(frozen=True)
class _MensajeRecibido:
    telefono: str
    message_id: str | None
    nombre: str | None
    # Cada mensaje trae texto o, si es un mensaje de voz, el id del audio en Meta.
    texto: str | None = None
    audio_id: str | None = None


def _mensajes_recibidos(data: dict):
    """Mensajes de texto y de voz recibidos en la notificación (lo demás, como imágenes o ubicaciones, se ignora)."""
    for entrada in data.get("entry") or []:
        for cambio in entrada.get("changes") or []:
            valor = cambio.get("value") or {}
            nombres = {
                contacto.get("wa_id"): (contacto.get("profile") or {}).get("name")
                for contacto in valor.get("contacts") or []
            }
            for mensaje in valor.get("messages") or []:
                telefono = mensaje.get("from")
                if not telefono:
                    continue
                datos = {"telefono": telefono, "message_id": mensaje.get("id"), "nombre": nombres.get(telefono)}
                texto = (mensaje.get("text") or {}).get("body")
                # Las notas de voz y los audios adjuntos llegan como "audio" (.ogg o .mp4).
                audio_id = (mensaje.get("audio") or {}).get("id")
                if mensaje.get("type") == "text" and texto:
                    yield _MensajeRecibido(**datos, texto=texto)
                elif mensaje.get("type") == "audio" and audio_id:
                    yield _MensajeRecibido(**datos, audio_id=audio_id)


def _chat_del_destinatario(telefono: str) -> str:
    """Inverso de lo que hace el canal al enviar: Meta registra los celulares argentinos como 54... (sin el 9),
    pero el chat del cliente llega como 549..."""
    if telefono.startswith("54") and not telefono.startswith("549") and len(telefono) == 12:
        return "549" + telefono[2:]
    return telefono


def _mensajes_salientes(data: dict):
    """(teléfono del cliente, texto) de cada mensaje que el local envió desde la app de Meta Business Suite.

    Meta los notifica como "message echoes" (campo `smb_message_echoes`) cuando el número también se usa en la app.
    """
    for entrada in data.get("entry") or []:
        for cambio in entrada.get("changes") or []:
            if cambio.get("field") != "smb_message_echoes":
                continue
            for mensaje in (cambio.get("value") or {}).get("message_echoes") or []:
                texto = (mensaje.get("text") or {}).get("body")
                if mensaje.get("type", "text") == "text" and texto and mensaje.get("to"):
                    yield _chat_del_destinatario(mensaje["to"]), texto


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
    for mensaje in _mensajes_recibidos(data):
        if isinstance(canal, WhatsAppChannel) and mensaje.message_id:
            canal.recordar_mensaje_recibido(mensaje.telefono, mensaje.message_id)
        # En WhatsApp el chat es el teléfono del cliente.
        bot_service.registrar_perfil(Channel.WHATSAPP, mensaje.telefono, mensaje.nombre, telefono=mensaje.telefono)
        if mensaje.texto:
            bot_service.recibir_mensaje(Channel.WHATSAPP, mensaje.telefono, mensaje.texto)
        elif mensaje.audio_id:
            # Se transcribe en segundo plano: Meta espera la confirmación enseguida.
            bot_service.recibir_audio(Channel.WHATSAPP, mensaje.telefono, mensaje.audio_id)

    for telefono, texto in _mensajes_salientes(data):
        # Un empleado respondió desde Meta Business Suite: el bot se pausa en ese chat.
        bot_service.registrar_mensaje_saliente(Channel.WHATSAPP, telefono, texto)

    # Meta reintenta lo que no se confirma con 200 (también llegan avisos de entrega/lectura, que se ignoran).
    return {"status": "ok"}
