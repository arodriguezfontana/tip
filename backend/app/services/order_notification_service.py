"""Notificaciones proactivas al cliente (por el canal en que hizo el pedido) ante cambios de estado."""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.time import RESTAURANT_TZ
from app.models.order import Order, OrderStatus
from app.services.channels import enviar_mensaje

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OrderSnapshot:
    """Datos del pedido que necesita la notificación.

    Se envía en segundo plano, después de responder y de cerrar la sesión de la base: por eso no recibe
    la entidad (que quedaría desconectada de la sesión) sino una copia de lo que necesita.
    """

    id: int
    channel: str | None
    chat_id: str | None
    estimated_minutes: int | None
    scheduled_for: datetime | None
    is_paid: bool = False

    @classmethod
    def of(cls, order: Order) -> "OrderSnapshot":
        return cls(
            id=order.id,
            channel=order.channel,
            chat_id=order.chat_id,
            estimated_minutes=order.estimated_minutes,
            scheduled_for=order.scheduled_for,
            is_paid=bool(order.is_paid),
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
    if new_status == OrderStatus.CANCELLED:
        mensaje = f"Lamentablemente tuvimos que cancelar tu pedido #{order.id}. ❌ Disculpá las molestias."
        if order.is_paid:
            mensaje += "\nComo ya lo habías abonado, comunicate con el local para coordinar el reintegro."
        else:
            mensaje += "\nSi tenés dudas, contactanos."
        return mensaje
    if new_status == OrderStatus.ON_THE_WAY:
        return "¡Tu pedido ya está en camino! 🛵 En breve lo vas a recibir."
    if new_status == OrderStatus.READY_FOR_PICKUP:
        return "¡Tu pedido está listo para retirar! 🎉 Ya podés pasar a buscarlo."
    return None


async def notify_order_status_change(order: OrderSnapshot, new_status: str) -> None:
    if not order.channel or not order.chat_id:
        logger.warning(
            "Orden #%s no tiene canal ni chat, no se puede notificar el cambio a '%s'.",
            order.id,
            new_status,
        )
        return

    mensaje = build_status_message(order, new_status)
    if mensaje is None:
        return

    await enviar_mensaje(order.channel, order.chat_id, mensaje)
