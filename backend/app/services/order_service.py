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


def calcular_demora_inteligente(db: Session, order: Order) -> int:
    """Calcula la demora estimada con 15 minutos de base y carga en cocina."""
    pedidos_en_cola = db.query(Order).filter(Order.status.in_(["Pendiente", "Confirmado"])).count()
    
    tiempo_base = 15 + (pedidos_en_cola * 3)
    
    items_count = len(order.items) if order.items else 1
    tiempo_items = items_count * 2
    
    demora_sugerida = min(tiempo_base + tiempo_items, 90)
    return max(demora_sugerida, 15)

def transition_order_status(
    db: Session, order: Order, new_status: str, estimated_minutes: int | None = None
) -> Order:
    allowed = ALLOWED_TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise InvalidTransitionError(order.status, new_status)

    if new_status == "Confirmado":
        if estimated_minutes is None:
            estimated_minutes = calcular_demora_inteligente(db, order)

    order.status = new_status
    if estimated_minutes is not None:
        order.estimated_minutes = estimated_minutes
    db.commit()
    db.refresh(order)
    return order