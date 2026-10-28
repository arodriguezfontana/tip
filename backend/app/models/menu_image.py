from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, LargeBinary, String
from sqlalchemy.orm import deferred

from app.db.base_class import Base
from app.models.menu import ProductImage

# El menú puede estar partido en varias imágenes (una por sección de la carta, por ejemplo).
MAX_MENU_IMAGES = 10


class MenuImage(Base):
    """Una de las imágenes (JPG o PNG) con la carta del local; el bot las manda todas, en orden, cuando el
    cliente pide el menú.

    Se guardan en la base, igual que las de los productos: los bytes van aparte para no traerlos al consultar
    sus datos.
    """

    __tablename__ = "menu_images"

    id = Column(Integer, primary_key=True)
    # Orden en que se muestran y se mandan, de menor a mayor.
    position = Column(Integer, nullable=False, default=0)
    content_type = Column(String(20), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    data = deferred(Column(LargeBinary, nullable=False))
    updated_at = Column(DateTime(timezone=True), nullable=False)

    @property
    def version(self) -> int:
        """Cambia cada vez que se reemplaza la imagen: sirve para no mostrar ni reenviar una copia vieja."""
        return int(self.updated_at.timestamp() * 1000)

    def replace(self, data: bytes, now: datetime) -> None:
        """Reemplaza la imagen. Solo JPG o PNG de hasta 5 MB, el máximo de la API de WhatsApp para imágenes."""
        self.content_type = ProductImage.content_type_of(data)
        self.data = data
        self.size_bytes = len(data)
        self.updated_at = now
