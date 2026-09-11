"""Notificaciones proactivas al cliente por Telegram ante cambios de estado del pedido."""

import logging

from app.modules.order import Order
from app.services.telegram_service import send_telegram_message

logger = logging.getLogger(__name__)


def build_status_message(order: Order, new_status: str) -> str | None:
    if new_status == "Confirmado":
        return (
            f"¡Tu pedido #{order.id} fue aceptado! ✅\n"
            f"Tiempo estimado de entrega: {order.estimated_minutes} minutos aproximadamente."
        )
    if new_status == "Rechazado":
        return "Lamentablemente tu pedido fue rechazado. Contactanos si tenés dudas."
    if new_status == "En Camino":
        return "¡Tu pedido ya está en camino! 🛵 En breve lo vas a recibir."
    if new_status == "Listo para Retirar":
        return "¡Tu pedido está listo para retirar! 🎉 Ya podés pasar a buscarlo."
    return None


async def notify_order_status_change(order: Order, new_status: str) -> None:
    if not order.telegram_chat_id:
        logger.warning(
            "Orden #%s no tiene telegram_chat_id, no se puede notificar el cambio a '%s'.",
            order.id,
            new_status,
        )
        return

    mensaje = build_status_message(order, new_status)
    if mensaje is None:
        return

    try:
        chat_id = int(order.telegram_chat_id)
    except ValueError:
        logger.error(
            "telegram_chat_id inválido en la orden #%s: %r", order.id, order.telegram_chat_id
        )
        return

    await send_telegram_message(chat_id, mensaje)
