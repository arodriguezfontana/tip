from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from app.core.config import settings
from app.services.telegram_service import TelegramService

router = APIRouter()
telegram_service = TelegramService()


@router.post("/webhook")
async def recibir_mensaje(
    request: Request,
    background_tasks: BackgroundTasks,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    if settings.TELEGRAM_WEBHOOK_SECRET and (
        x_telegram_bot_api_secret_token != settings.TELEGRAM_WEBHOOK_SECRET
    ):
        raise HTTPException(status_code=403, detail="Token de webhook inválido")

    data = await request.json()

    if "message" in data and "text" in data["message"]:
        chat_id = str(data["message"]["chat"]["id"])
        mensaje_usuario = data["message"]["text"]
        
        background_tasks.add_task(
            telegram_service.procesar_y_enviar, chat_id, mensaje_usuario
        )

    return {"status": "ok"}