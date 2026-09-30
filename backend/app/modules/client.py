from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.db.base_class import Base


class Client(Base):
    """Agenda de clientes del local, identificados por su teléfono.

    La completa el personal al cargar pedidos en el mostrador y sirve para autocompletar los datos
    de clientes recurrentes. Es independiente de las cuentas web de clientes (tabla `users`).
    """

    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    # Solo dígitos (y '+' inicial), para que "11 4444-5555" y "1144445555" sean el mismo cliente.
    phone = Column(String(30), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
