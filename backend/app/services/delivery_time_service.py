"""Estimación de la demora de un pedido a partir del historial real del local.

Modo inteligente: si hay suficientes pedidos parecidos ya entregados (mismo método de entrega y aceptados con la
misma cantidad de pedidos en cola), la demora es el promedio de lo que tardaron. Si no, la tiene que indicar el
personal al aceptar el pedido. Esos pedidos con demora manual también alimentan el historial, así que cuando una
situación junta datos suficientes el sistema deja de pedir la intervención del empleado.
"""

from dataclasses import dataclass
from enum import Enum

from sqlalchemy.orm import Session

from app.models.order import DeliveryMethod, OrderStatus
from app.repositories import order_repository

# Pedidos parecidos necesarios para fiarse del promedio.
MIN_SAMPLES_FOR_SMART_ESTIMATE = 30
# Cuántos de los últimos pedidos parecidos se promedian (para que pese lo reciente).
MAX_SAMPLES_CONSIDERED = 100
# Tiempos fuera de este rango (pedido que quedó abierto, cambios de estado cargados a destiempo) se descartan.
MAX_PLAUSIBLE_MINUTES = 240


class EstimateMode(str, Enum):
    SMART = "smart"
    MANUAL = "manual"


@dataclass(frozen=True)
class DelayEstimate:
    mode: EstimateMode
    # Demora calculada con el historial; solo en modo inteligente.
    minutes: int | None
    # Pedidos parecidos con los que se calculó (o los que hay, si todavía no alcanzan).
    samples: int
    min_samples: int
    # Pedidos en cola al momento de la estimación.
    queue_size: int

    @property
    def is_smart(self) -> bool:
        return self.mode == EstimateMode.SMART


def _end_status(delivery_method: DeliveryMethod | str) -> OrderStatus:
    """Cuándo recibe el cliente su pedido: al entregarlo a domicilio o al quedar listo para retirar."""
    if DeliveryMethod(delivery_method) == DeliveryMethod.PICKUP:
        return OrderStatus.READY_FOR_PICKUP
    return OrderStatus.COMPLETED


def estimate_delay(db: Session, delivery_method: DeliveryMethod | str, queue_size: int) -> DelayEstimate:
    """Demora estimada para un pedido que se acepta ahora, con `queue_size` pedidos en cola."""
    intervals = order_repository.delivered_intervals(
        db,
        DeliveryMethod(delivery_method).value,
        _end_status(delivery_method),
        queue_size,
        MAX_SAMPLES_CONSIDERED,
    )
    durations = [(end - start).total_seconds() / 60 for start, end in intervals]
    durations = [m for m in durations if 0 < m <= MAX_PLAUSIBLE_MINUTES]

    if len(durations) < MIN_SAMPLES_FOR_SMART_ESTIMATE:
        return DelayEstimate(EstimateMode.MANUAL, None, len(durations), MIN_SAMPLES_FOR_SMART_ESTIMATE, queue_size)
    average = max(1, round(sum(durations) / len(durations)))
    return DelayEstimate(EstimateMode.SMART, average, len(durations), MIN_SAMPLES_FOR_SMART_ESTIMATE, queue_size)
