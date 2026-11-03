import hmac

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.channels import Channel
from app.core.config import settings
from app.services.bot_service import bot_service

router = APIRouter()


@router.post("/webhook")
async def recibir_mensaje(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    if Channel.TELEGRAM not in settings.canales_habilitados:
        raise HTTPException(status_code=404, detail="El canal de Telegram no está habilitado")

    recibido = x_telegram_bot_api_secret_token or ""
    if not hmac.compare_digest(recibido, settings.telegram_webhook_secret):
        raise HTTPException(status_code=403, detail="Token de webhook inválido")

    data = await request.json()

    if "message" in data and "text" in data["message"]:
        chat_id = str(data["message"]["chat"]["id"])
        mensaje_usuario = data["message"]["text"]

        remitente = data["message"].get("from") or {}
        nombre = " ".join(p for p in (remitente.get("first_name"), remitente.get("last_name")) if p)
        bot_service.registrar_perfil(Channel.TELEGRAM, chat_id, nombre, usuario=remitente.get("username"))

        # Responde 200 enseguida; el mensaje espera un instante por si el cliente manda más (se contestan juntos).
        bot_service.recibir_mensaje(Channel.TELEGRAM, chat_id, mensaje_usuario)

    return {"status": "ok"}
