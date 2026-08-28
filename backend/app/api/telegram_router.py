import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Header, Request

from app.core.config import settings
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter()
chat_service = ChatService()

MENSAJE_FALLBACK = (
    "Disculpá, tuve un problema para responderte. ¿Podés intentar de nuevo en un momento?"
)


async def enviar_mensaje(chat_id: int, texto: str):
    """Envía la respuesta de Gemini de vuelta a Telegram."""
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": texto}

    async with httpx.AsyncClient(timeout=100.0) as client:
        await client.post(url, json=payload)


async def procesar_y_enviar(chat_id: str, mensaje: str):
    try:
        respuesta_ia = await chat_service.obtener_respuesta(mensaje, session_id=chat_id)
        await enviar_mensaje(int(chat_id), respuesta_ia)
    except Exception:
        logger.exception("Error procesando el mensaje de chat_id=%s", chat_id)
        try:
            await enviar_mensaje(int(chat_id), MENSAJE_FALLBACK)
        except Exception:
            logger.exception("Error enviando el mensaje de fallback a chat_id=%s", chat_id)


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
        background_tasks.add_task(procesar_y_enviar, chat_id, mensaje_usuario)

    return {"status": "ok"}