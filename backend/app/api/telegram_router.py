import hmac

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.config import settings
from app.services.telegram_service import TelegramService

router = APIRouter()
telegram_service = TelegramService()


@router.post("/webhook")
async def recibir_mensaje(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    recibido = x_telegram_bot_api_secret_token or ""
    if not hmac.compare_digest(recibido, settings.telegram_webhook_secret):
        raise HTTPException(status_code=403, detail="Token de webhook inválido")

    data = await request.json()

    if "message" in data and "text" in data["message"]:
        chat_id = str(data["message"]["chat"]["id"])
        mensaje_usuario = data["message"]["text"]

        # Responde 200 enseguida; el mensaje espera un instante por si el cliente manda más (se contestan juntos).
        telegram_service.recibir_mensaje(chat_id, mensaje_usuario)

    return {"status": "ok"}
