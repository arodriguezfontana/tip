import contextlib
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.mercadopago_service import process_payment_notification
from app.services.telegram_service import send_telegram_message

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/webhook")
async def mercadopago_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Webhook para notificaciones de pago de MercadoPago.

    Cuando se recibe un pago aprobado, actualiza el estado de pago del pedido a 'Abonado'
    (is_paid = True) y notifica al cliente si el pedido se originó vía Telegram.
    """
    payload = {}
    with contextlib.suppress(Exception):
        payload = await request.json()

    query_params = dict(request.query_params)
    order = process_payment_notification(db, payload=payload, query_params=query_params)

    if order and order.telegram_chat_id:
        mensaje = (
            f"✅ ¡Recibimos tu pago por MercadoPago para el pedido #{order.id}!\n"
            f"El estado de tu pedido fue actualizado a Abonado. ¡Muchas gracias!"
        )
        try:
            background_tasks.add_task(send_telegram_message, int(order.telegram_chat_id), mensaje)
        except Exception as e:
            logger.warning("No se pudo programar el aviso de pago a Telegram para chat_id=%s: %s", order.telegram_chat_id, e)

    return {"status": "ok"}


@router.get("/webhook")
def mercadopago_webhook_ping():
    return {"status": "ok"}

