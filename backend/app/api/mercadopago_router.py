import contextlib
import logging
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.mercadopago_service import (
    confirm_payment,
    frontend_menu_url,
    payment_received_message,
    process_payment_notification,
)
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
        mensaje = payment_received_message(order)
        try:
            background_tasks.add_task(send_telegram_message, int(order.telegram_chat_id), mensaje)
        except Exception as e:
            logger.warning("No se pudo programar el aviso de pago a Telegram para chat_id=%s: %s", order.telegram_chat_id, e)

    return {"status": "ok"}


class PaymentConfirmation(BaseModel):
    payment_id: str = Field(..., min_length=1, max_length=50, pattern=r"^[0-9A-Za-z_-]+$")


class PaymentConfirmationResponse(BaseModel):
    # Estado del pago según MercadoPago ('approved', 'pending', 'rejected', ...); None si no se pudo consultar.
    status: str | None


@router.post("/confirm", response_model=PaymentConfirmationResponse)
def mercadopago_confirm(payload: PaymentConfirmation, db: Session = Depends(get_db)) -> PaymentConfirmationResponse:
    """Endpoint público al que llama la web cuando el cliente vuelve del checkout de MercadoPago.

    El estado se consulta directamente a MercadoPago con el id del pago, así que no alcanza con inventar
    uno para marcar un pedido como abonado.
    """
    return PaymentConfirmationResponse(status=confirm_payment(db, payload.payment_id))


# Lo único que MercadoPago agrega al volver del checkout y que la web necesita.
_RETURN_PARAMS = ("pedido", "payment_id", "status", "collection_status", "external_reference")


@router.get("/return", include_in_schema=False)
def mercadopago_return(request: Request) -> RedirectResponse:
    """A donde MercadoPago devuelve al cliente después de pagar: lo redirige a la web de pedidos.

    El destino es siempre la web del local; solo se reenvía el resultado del pago (no se redirige a
    ninguna dirección que venga en la consulta).
    """
    params = {key: request.query_params[key] for key in _RETURN_PARAMS if key in request.query_params}
    return RedirectResponse(f"{frontend_menu_url()}?{urlencode(params)}", status_code=302)


@router.get("/webhook")
def mercadopago_webhook_ping():
    return {"status": "ok"}

