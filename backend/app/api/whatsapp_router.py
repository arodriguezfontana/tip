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


def _mensajes_de_texto(data: dict):
    """(teléfono, id del mensaje, texto, nombre del perfil) de cada mensaje de texto recibido en la notificación."""
    for entrada in data.get("entry") or []:
        for cambio in entrada.get("changes") or []:
            valor = cambio.get("value") or {}
            nombres = {
                contacto.get("wa_id"): (contacto.get("profile") or {}).get("name")
                for contacto in valor.get("contacts") or []
            }
            for mensaje in valor.get("messages") or []:
                texto = (mensaje.get("text") or {}).get("body")
                if mensaje.get("type") == "text" and texto and mensaje.get("from"):
                    yield mensaje["from"], mensaje.get("id"), texto, nombres.get(mensaje["from"])


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
    for telefono, message_id, texto, nombre in _mensajes_de_texto(data):
        if isinstance(canal, WhatsAppChannel) and message_id:
            canal.recordar_mensaje_recibido(telefono, message_id)
        # En WhatsApp el chat es el teléfono del cliente.
        bot_service.registrar_perfil(Channel.WHATSAPP, telefono, nombre, telefono=telefono)
        bot_service.recibir_mensaje(Channel.WHATSAPP, telefono, texto)

    # Meta reintenta lo que no se confirma con 200 (también llegan avisos de entrega/lectura, que se ignoran).
    return {"status": "ok"}
