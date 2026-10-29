from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import validates
from sqlalchemy.sql import func

from app.core.phone import normalize_phone
from app.db.base_class import Base


class Client(Base):
    """Agenda de clientes del local, identificados por su teléfono.

    La completa el personal al cargar pedidos en el mostrador y sirve para autocompletar los datos
    de clientes recurrentes. Es independiente de las cuentas web de clientes (tabla `users`).
    """

    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    # En el formato único de teléfonos (ver core.phone): "11 4444-5555", "+54 9 11 4444-5555" y "1144445555"
    # son el mismo cliente.
    phone = Column(String(30), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    @staticmethod
    def normalize_phone(phone: str) -> str:
        """Pasa el teléfono al formato único para comparar números escritos de distinta manera."""
        return normalize_phone(phone)

    @validates("phone")
    def _normalize_phone(self, _key: str, phone: str) -> str:
        return self.normalize_phone(phone)

    @validates("full_name")
    def _strip_name(self, _key: str, full_name: str) -> str:
        return full_name.strip()

    @validates("address")
    def _strip_address(self, _key: str, address: str | None) -> str | None:
        return (address or "").strip() or None

    def update_details(self, full_name: str, phone: str, address: str | None) -> None:
        """Edición manual desde el panel: se reemplazan todos los datos."""
        self.full_name = full_name
        self.phone = phone
        self.address = address

    def register_order_contact(self, full_name: str, address: str | None) -> None:
        """Actualiza el cliente con los datos de su último pedido.

        La dirección solo se pisa cuando viene informada: un pedido para retirar en el local no borra la
        dirección que ya teníamos guardada.
        """
        self.full_name = full_name
        if address:
            self.address = address
