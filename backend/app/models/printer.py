from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base_class import Base


class Printer(Base):
    """Impresora de comandas (térmica de red) vinculada a un sector de preparación."""

    __tablename__ = "printers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Un sector tiene a lo sumo una impresora.
    sector: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Dirección de red de la impresora (IP o nombre) y puerto RAW/JetDirect (9100 en casi todas las térmicas).
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=9100, server_default="9100")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
