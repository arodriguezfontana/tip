from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base_class import Base


class SecurityAuditEvent(Base):
    """Eventos de auditoría de seguridad del sistema (desbloqueos, fallos y bloqueos temporales de PIN)."""

    __tablename__ = "security_audit_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False)  # 'pin_unlocked', 'pin_failed', 'pin_blocked'
    pin_type = Column(String(20), nullable=False)  # 'admin', 'cash'
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ip_address = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")


class PinLockout(Base):
    """Estado de intentos fallidos y bloqueos temporales por PIN."""

    __tablename__ = "pin_lockouts"

    pin_type = Column(String(20), primary_key=True)  # 'admin', 'cash'
    failed_attempts = Column(Integer, default=0, nullable=False)
    blocked_until = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

