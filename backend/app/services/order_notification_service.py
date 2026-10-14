"""Notificaciones proactivas al cliente por Telegram ante cambios de estado del pedido."""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.time import RESTAURANT_TZ
from app.modules.order import Order, OrderStatus
from app.services.telegram_service import send_telegram_message

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OrderSnapshot:
    """Datos del pedido que necesita la notificación.

    Se envía en segundo plano, después de responder y de cerrar la sesión de la base: por eso no recibe
    la entidad (que quedaría desconectada de la sesión) sino una copia de lo que necesita.
    """

    id: int
    telegram_chat_id: str | None
    estimated_minutes: int | None
    scheduled_for: datetime | None

    @classmethod
    def of(cls, order: Order) -> "OrderSnapshot":
        return cls(
            id=order.id,
            telegram_chat_id=order.telegram_chat_id,
            estimated_minutes=order.estimated_minutes,
            scheduled_for=order.scheduled_for,
        )


def _horario_programado(order: Order | OrderSnapshot) -> str:
    programado = order.scheduled_for
    if programado.tzinfo is None:  # la base lo guarda en UTC
        programado = programado.replace(tzinfo=timezone.utc)
    return f"{programado.astimezone(RESTAURANT_TZ):%H:%M}"


def build_status_message(order: Order | OrderSnapshot, new_status: str) -> str | None:
    if new_status == OrderStatus.CONFIRMED and order.scheduled_for is not None:
        return f"¡Tu pedido #{order.id} fue aceptado! ✅\nLo vamos a tener listo para las {_horario_programado(order)}."
    if new_status == OrderStatus.CONFIRMED:
        return (
            f"¡Tu pedido #{order.id} fue aceptado! ✅\n"
            f"Tiempo estimado de entrega: {order.estimated_minutes} minutos aproximadamente."
        )
    if new_status == OrderStatus.REJECTED:
        return "Lamentablemente tu pedido fue rechazado. Contactanos si tenés dudas."
    if new_status == OrderStatus.ON_THE_WAY:
        return "¡Tu pedido ya está en camino! 🛵 En breve lo vas a recibir."
    if new_status == OrderStatus.READY_FOR_PICKUP:
        return "¡Tu pedido está listo para retirar! 🎉 Ya podés pasar a buscarlo."
    return None


async def notify_order_status_change(order: OrderSnapshot, new_status: str) -> None:
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
