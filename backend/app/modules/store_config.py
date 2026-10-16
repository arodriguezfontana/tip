from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base_class import Base


class StoreConfig(Base):
    """Configuración visual e institucional de la página web de pedidos.

    Permite al dueño del local personalizar el nombre comercial, datos de contacto
    (dirección, horarios, teléfonos), logotipo y el color principal de la interfaz pública.
    """

    __tablename__ = "store_configs"

    id = Column(Integer, primary_key=True, index=True)
    store_name = Column(String(100), nullable=False, default="RestoIT")
    address = Column(String(255), nullable=True)
    opening_hours = Column(String(255), nullable=True)
    contact_phone = Column(String(100), nullable=True)
    logo_url = Column(Text, nullable=True)
    theme_color = Column(String(30), nullable=False, default="black")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

