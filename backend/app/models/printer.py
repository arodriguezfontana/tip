from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.db.base_class import Base


class Printer(Base):
    """Impresora de comandas (térmica de red) vinculada a un sector de preparación."""

    __tablename__ = "printers"

    id = Column(Integer, primary_key=True, index=True)
    # Un sector tiene a lo sumo una impresora.
    sector = Column(String(50), nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    # Dirección de red de la impresora (IP o nombre) y puerto RAW/JetDirect (9100 en casi todas las térmicas).
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False, default=9100, server_default="9100")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
