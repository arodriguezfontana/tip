import re
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from sqlalchemy.sql import func

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.order import Order


class DeliveryDriver(Base):
    """Repartidor del local para envíos a domicilio."""

    __tablename__ = "delivery_drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="delivery_driver")

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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    delivery_driver_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("delivery_drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dispatched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Duración total de la ida (hasta la última entrega, con la tolerancia de cada parada), en minutos.
    # Vacía si el viaje salió sin poder calcular la ruta.
    total_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    driver: Mapped["DeliveryDriver"] = relationship("DeliveryDriver")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="trip", order_by="Order.trip_stop")
