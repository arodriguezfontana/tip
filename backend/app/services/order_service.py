"""Lógica de negocio para las transiciones de estado de un pedido."""

from sqlalchemy.orm import Session

from app.modules.order import Order

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "Pendiente": {"Confirmado", "Rechazado"},
    "Confirmado": {"En Camino", "Listo para Retirar"},
    "En Camino": {"Finalizado"},
    "Listo para Retirar": {"Finalizado"},
    "Finalizado": set(),
    "Rechazado": set(),
}


class InvalidTransitionError(Exception):
    def __init__(self, current_status: str, new_status: str):
        self.current_status = current_status
        self.new_status = new_status
        super().__init__(f"No se puede pasar de '{current_status}' a '{new_status}'.")


class MissingEstimatedMinutesError(Exception):
    def __init__(self):
        super().__init__("Debe indicar un tiempo estimado de demora al confirmar el pedido.")


class ScheduledOrderEstimateError(Exception):
    def __init__(self):
        super().__init__("Los pedidos programados se entregan en su horario y no llevan demora estimada.")


DEMORA_MINIMA_MINUTOS = 15
MINUTOS_POR_PEDIDO_EN_PROCESO = 3


def calcular_demora_actual(db: Session) -> int:
    """Demora estimada para un pedido nuevo: 15 minutos de base más 3 por cada pedido en proceso
    (confirmado pero todavía no despachado ni listo para retirar)."""
    pedidos_en_proceso = db.query(Order).filter(Order.status == "Confirmado").count()
    return DEMORA_MINIMA_MINUTOS + pedidos_en_proceso * MINUTOS_POR_PEDIDO_EN_PROCESO


def transition_order_status(
    db: Session, order: Order, new_status: str, estimated_minutes: int | None = None
) -> Order:
    allowed = ALLOWED_TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise InvalidTransitionError(order.status, new_status)

    if order.scheduled_for is not None:
        # Los programados se entregan en su horario: no llevan demora estimada.
        if estimated_minutes is not None:
            raise ScheduledOrderEstimateError()
    elif new_status == "Confirmado" and estimated_minutes is None:
        estimated_minutes = calcular_demora_actual(db)

    order.status = new_status
    if estimated_minutes is not None:
        order.estimated_minutes = estimated_minutes
    db.commit()
    db.refresh(order)
    return order