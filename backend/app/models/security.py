from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.user import User


class SecurityAuditEvent(Base):
    """Eventos de auditoría de seguridad del sistema (desbloqueos, fallos y bloqueos temporales de PIN)."""

    __tablename__ = "security_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'pin_unlocked', 'pin_failed', 'pin_blocked'
    pin_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'admin', 'cash'
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(100), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User | None"] = relationship("User")


class PinLockout(Base):
    """Estado de intentos fallidos y bloqueos temporales por PIN."""

    __tablename__ = "pin_lockouts"

    pin_type: Mapped[str] = mapped_column(String(20), primary_key=True)  # 'admin', 'cash'
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
