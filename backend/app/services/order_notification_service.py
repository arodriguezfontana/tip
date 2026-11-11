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
    # Llegada estimada a la parada del viaje (solo pedidos despachados).
    eta_minutes: int | None = None

    @classmethod
    def of(cls, order: Order) -> "OrderSnapshot":
        return cls(
            id=order.id,
            channel=order.channel,
            chat_id=order.chat_id,
            estimated_minutes=order.estimated_minutes,
            scheduled_for=order.scheduled_for,
            is_paid=bool(order.is_paid),
            eta_minutes=order.eta_minutes,
        )


def _horario_programado(programado: datetime) -> str:
    if programado.tzinfo is None:  # la base lo guarda en UTC
        programado = programado.replace(tzinfo=timezone.utc)
    return f"{programado.astimezone(RESTAURANT_TZ):%H:%M}"


def _mensaje_de_aceptacion(order: Order | OrderSnapshot, payment_instructions: str | None) -> str:
    if order.scheduled_for is not None:
        cuando = f"Lo vamos a tener listo para las {_horario_programado(order.scheduled_for)}."
    else:
        cuando = f"Tiempo estimado de entrega: {order.estimated_minutes} minutos aproximadamente."
    mensaje = f"¡Tu pedido #{order.id} fue aceptado! ✅\n{cuando}"
    return f"{mensaje}\n\n{payment_instructions}" if payment_instructions else mensaje


def _mensaje_de_cancelacion(order: Order | OrderSnapshot) -> str:
    mensaje = f"Lamentablemente tuvimos que cancelar tu pedido #{order.id}. ❌ Disculpá las molestias."
    if order.is_paid:
        return mensaje + "\nComo ya lo habías abonado, comunicate con el local para coordinar el reintegro."
    return mensaje + "\nSi tenés dudas, contactanos."


def build_status_message(
    order: Order | OrderSnapshot, new_status: str, payment_instructions: str | None = None
) -> str | None:
    if new_status == OrderStatus.CONFIRMED:
        return _mensaje_de_aceptacion(order, payment_instructions)
    if new_status == OrderStatus.REJECTED:
        return "Lamentablemente tu pedido fue rechazado. Contactanos si tenés dudas."
    if new_status == OrderStatus.CANCELLED:
        return _mensaje_de_cancelacion(order)
    if new_status == OrderStatus.READY_FOR_PICKUP:
        return "¡Tu pedido está listo para retirar! 🎉 Ya podés pasar a buscarlo."
    return None


def build_trip_message(order: Order | OrderSnapshot) -> str:
    if order.eta_minutes is None:
        # No se pudo calcular el tiempo de viaje: se avisa igual que salió, sin prometer una hora.
        return "¡Tu pedido está en camino! 🛵"
    return f"¡Tu pedido está en camino! 🛵 Llegará a tu domicilio en aproximadamente {order.eta_minutes} minutos."


async def _avisar_salida_del_viaje(order: OrderSnapshot) -> None:
    try:
        await enviar_mensaje(order.channel, order.chat_id, build_trip_message(order))
    except Exception:
        # Un aviso que falla no tiene que cortar los de los demás clientes del viaje.
        logger.exception("No se pudo avisar la salida del viaje del pedido #%s.", order.id)


async def notify_trip_dispatched(orders: list[OrderSnapshot]) -> None:
    """Avisa a todos los clientes del viaje, cada uno con su llegada estimada si se pudo calcular (los pedidos sin chat
    se saltean)."""
    for order in [order for order in orders if order.channel and order.chat_id]:
        await _avisar_salida_del_viaje(order)


async def notify_order_status_change(
    order: OrderSnapshot, new_status: str, payment_instructions: str | None = None
) -> None:
    if new_status == OrderStatus.ON_THE_WAY:
        # Salir "En Camino" arma el viaje en silencio: el aviso con la llegada sale al iniciarlo (notify_trip_dispatched).
        return

    if not order.channel or not order.chat_id:
        logger.warning(
            "Orden #%s no tiene canal ni chat, no se puede notificar el cambio a '%s'.",
            order.id,
            new_status,
        )
        return

    mensaje = build_status_message(order, new_status, payment_instructions)
    if mensaje is None:
        return

    await enviar_mensaje(order.channel, order.chat_id, mensaje)
