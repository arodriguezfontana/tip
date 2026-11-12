"""Viajes de los repartidores: armado de lotes de pedidos "En Camino" y despacho con la ruta de Google Maps.

Un pedido que pasa a "En Camino" y recibe repartidor queda "armando viaje", sin avisarle nada al cliente. Al iniciar el
viaje se calcula una sola ruta con todos los pedidos del lote y cada cliente recibe su llegada estimada. Un pedido que
se suma después al mismo repartidor forma el viaje siguiente: nunca se recalcula una ruta que ya está en curso."""

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BusinessRuleError, NotFoundError
from app.db.session import transaction
from app.models.delivery_driver import DeliveryDriver, DeliveryTrip
from app.models.order import Order
from app.repositories import delivery_driver_repository, order_repository
from app.services import maps_service
from app.services.store_config_service import get_or_create_store_config

logger = logging.getLogger(__name__)


def trip_orders_waiting(db: Session, delivery_driver_id: int) -> list[Order]:
    """Pedidos en camino de ese repartidor que todavía no salieron de viaje."""
    return order_repository.undispatched_for_driver(db, delivery_driver_id)


def _estimate_route(db: Session, addresses: list[str]) -> tuple[list, list[int]]:
    """Posición en el recorrido y minutos de llegada de cada pedido, o RouteUnavailableError si no se pudo calcular."""
    origin = (get_or_create_store_config(db).address or "").strip()
    if not origin:
        raise maps_service.RouteUnavailableError(
            "Falta cargar la dirección del local en la configuración (es el punto de partida de la ruta)."
        )
    stops = maps_service.calculate_route(origin, addresses)
    etas = maps_service.cumulative_eta_minutes(stops, settings.DELIVERY_STOP_TOLERANCE_MINUTES)
    return stops, etas


def _select_orders_for_trip(waiting: list[Order], order_ids: list[int] | None) -> list[Order]:
    """Los pedidos que salen en el viaje: los indicados (en ese orden) o, si no se indican, todos los armados."""
    if order_ids is None:
        return waiting
    by_id = {order.id: order for order in waiting}
    missing = [order_id for order_id in order_ids if order_id not in by_id]
    if missing:
        raise BusinessRuleError(
            "Algunos pedidos no están armando viaje con este repartidor (o ya salieron): "
            + ", ".join(f"#{order_id}" for order_id in missing)
            + "."
        )
    return [by_id[order_id] for order_id in dict.fromkeys(order_ids)]


def _route_for(db: Session, driver: DeliveryDriver, orders: list[Order]) -> tuple[list, list[int], str | None]:
    """(paradas, llegadas estimadas, motivo por el que no se pudo calcular la ruta)."""
    try:
        stops, etas = _estimate_route(db, [order.shipping_address for order in orders])
    except maps_service.RouteUnavailableError as exc:
        # Un fallo de Google no frena al repartidor: sale igual y los clientes reciben el aviso sin tiempo.
        logger.warning("Viaje del repartidor #%s despachado sin tiempos estimados: %s", driver.id, exc)
        return [], [], str(exc)
    return stops, etas, None


def _planned_stops(orders: list[Order], stops: list, etas: list[int]) -> list[tuple[Order, int, int | None]]:
    """(pedido, número de parada, llegada estimada) en el orden del recorrido; sin ruta, en el orden en que se armó."""
    if not stops:
        return [(order, position, None) for position, order in enumerate(orders, start=1)]
    return [
        (orders[stop.index], position, eta)
        for position, (stop, eta) in enumerate(zip(stops, etas, strict=True), start=1)
    ]


def dispatch_trip(
    db: Session, delivery_driver_id: int, order_ids: list[int] | None = None
) -> tuple[DeliveryTrip, str | None]:
    """Inicia el viaje del repartidor con los pedidos indicados (o con todos los que tiene armados).

    Calcula la ruta una sola vez con el local como origen y asigna a cada pedido su parada y su llegada estimada.
    Si no se puede calcular (Google falla, no ubica una dirección, falta la clave...) el viaje sale igual, en el orden
    en que se armó y sin tiempos: devuelve además el motivo para avisárselo a quien lo inició."""
    driver = delivery_driver_repository.get(db, delivery_driver_id)
    if driver is None:
        raise NotFoundError("Repartidor no encontrado.")

    orders = _select_orders_for_trip(trip_orders_waiting(db, delivery_driver_id), order_ids)
    if not orders:
        raise BusinessRuleError(f"{driver.name} no tiene pedidos armando viaje.")

    stops, etas, warning = _route_for(db, driver, orders)
    with transaction(db):
        trip = DeliveryTrip(delivery_driver_id=driver.id, total_minutes=etas[-1] if etas else None)
        delivery_driver_repository.add_trip(db, trip)
        for order, position, eta in _planned_stops(orders, stops, etas):
            order.trip_id = trip.id
            order.trip_stop = position
            order.eta_minutes = eta
    db.refresh(trip)
    return trip, warning
