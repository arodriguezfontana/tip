from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base_class import Base


class StoreConfig(Base):
    """Configuración de identidad institucional y visual del local."""

    __tablename__ = "store_configs"

    id = Column(Integer, primary_key=True, index=True)
    store_name = Column(String(100), nullable=False, default="RestoIT")
    address = Column(String(255), nullable=True)
    contact_phone = Column(String(100), nullable=True)
    logo_url = Column(Text, nullable=True)
    theme_color = Column(String(30), nullable=False, default="black")
    login_bg = Column(String(50), nullable=False, default="bistro")
    # Imagen propia (Data URL) que se usa como fondo cuando login_bg es "custom".
    login_bg_image = Column(Text, nullable=True)
    mp_alias = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

