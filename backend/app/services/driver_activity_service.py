"""Historial de viajes de un repartidor: viajes del período, pedidos de cada uno y efectivo que debe rendir."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.delivery_driver import DeliveryTrip
from app.models.order import Order, OrderStatus
from app.repositories import cash_shift_repository, delivery_driver_repository
from app.services import delivery_driver_service

# Estados con los que un pedido deja de estar en la calle: cuando el último llega a uno, el viaje terminó.
_LEFT_THE_STREET_STATUSES = (OrderStatus.COMPLETED.value, OrderStatus.CANCELLED.value)
# Pedidos que no se llegaron a entregar: no hay dinero que rendir.
_NOT_COLLECTABLE_STATUSES = (OrderStatus.CANCELLED.value, OrderStatus.REJECTED.value)


@dataclass(frozen=True)
class TripSummary:
    id: int
    dispatched_at: datetime
    finished_at: datetime | None
    is_in_progress: bool
    stops_count: int
    orders: list[Order]


@dataclass(frozen=True)
class DriverActivity:
    trips_count: int
    delivered_orders_count: int
    cash_to_hand_over: Decimal
    trips: list[TripSummary]


def _finished_at(orders: list[Order]) -> datetime | None:
    """Cuándo salió de la calle el último pedido del viaje (None si alguno sigue en camino)."""
    if any(order.status == OrderStatus.ON_THE_WAY.value for order in orders):
        return None
    moments = [
        event.occurred_at
        for order in orders
        for event in order.status_events
        if event.status in _LEFT_THE_STREET_STATUSES
    ]
    return max(moments, default=None)


def _summarize(trip: DeliveryTrip) -> TripSummary:
    return TripSummary(
        id=trip.id,
        dispatched_at=trip.dispatched_at,
        finished_at=_finished_at(trip.orders),
        is_in_progress=any(order.status == OrderStatus.ON_THE_WAY.value for order in trip.orders),
        stops_count=len(trip.orders),
        orders=trip.orders,
    )


def _orders(trips: list[TripSummary]) -> list[Order]:
    return [order for trip in trips for order in trip.orders]


def _cash_pending_hand_over(orders: list[Order]) -> Decimal:
    """Efectivo que el repartidor todavía tiene que entregar: el de sus pedidos sin abonar. Marcar un pedido como
    abonado es registrar que el repartidor entregó ese dinero en la caja, y deja de sumar."""
    return sum(
        (
            order.amount_pending
            for order in orders
            if order.awaits_cash_payment and order.status not in _NOT_COLLECTABLE_STATUSES
        ),
        Decimal(0),
    )


def _trips_in_period(
    db: Session, driver_id: int, date_from: datetime | None, date_to: datetime | None, current_shift: bool
) -> list[DeliveryTrip]:
    """Los viajes despachados en el período; con "turno actual" el período arranca al abrir la caja (sin caja, ninguno)."""
    if current_shift:
        shift = cash_shift_repository.get_open_shift(db)
        if shift is None:
            return []
        date_from = shift.opened_at
    return delivery_driver_repository.trips_dispatched_between(db, driver_id, date_from, date_to)


def get_driver_activity(
    db: Session,
    driver_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    current_shift: bool = False,
) -> DriverActivity:
    """Viajes que el repartidor despachó en el período (o durante el turno de caja abierto, con `current_shift`)."""
    delivery_driver_service.get_delivery_driver(db, driver_id)
    trips = [_summarize(trip) for trip in _trips_in_period(db, driver_id, date_from, date_to, current_shift)]
    orders = _orders(trips)
    return DriverActivity(
        trips_count=len(trips),
        delivered_orders_count=sum(1 for order in orders if order.status == OrderStatus.COMPLETED.value),
        cash_to_hand_over=_cash_pending_hand_over(orders),
        trips=trips,
    )
