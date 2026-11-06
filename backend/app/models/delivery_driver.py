import re

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

from app.db.base_class import Base


class DeliveryDriver(Base):
    """Repartidor del local para envíos a domicilio."""

    __tablename__ = "delivery_drivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(30), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    orders = relationship("Order", back_populates="delivery_driver")

    @staticmethod
    def normalize_phone(phone: str) -> str:
        phone = phone.strip()
        digits = re.sub(r"\D", "", phone)
        return f"+{digits}" if phone.startswith("+") else digits

    @validates("phone")
    def _validate_phone(self, _key: str, phone: str) -> str:
        return self.normalize_phone(phone)

    @validates("name")
    def _validate_name(self, _key: str, name: str) -> str:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("El nombre del repartidor no puede estar vacío.")
        return cleaned


class DeliveryTrip(Base):
    """Recorrido de un repartidor con varios pedidos, despachado de una sola vez.

    Se crea al iniciar el viaje: la ruta se calcula sobre todos los pedidos del lote y cada uno queda con su parada y
    su tiempo estimado de llegada. Los pedidos que se sumen después al mismo repartidor forman otro viaje."""

    __tablename__ = "delivery_trips"

    id = Column(Integer, primary_key=True, index=True)
    delivery_driver_id = Column(
        Integer, ForeignKey("delivery_drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dispatched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Duración total de la ida (hasta la última entrega, con la tolerancia de cada parada), en minutos.
    # Vacía si el viaje salió sin poder calcular la ruta.
    total_minutes = Column(Integer, nullable=True)

    driver = relationship("DeliveryDriver")
    orders = relationship("Order", back_populates="trip", order_by="Order.trip_stop")
