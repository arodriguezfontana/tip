from sqlalchemy.orm import Session

from app.models.security import PinLockout, SecurityAuditEvent


def get_lockout(db: Session, pin_type: str) -> PinLockout | None:
    return db.query(PinLockout).filter(PinLockout.pin_type == pin_type).first()


def add_lockout(db: Session, lockout: PinLockout) -> None:
    db.add(lockout)


def add_audit_event(db: Session, event: SecurityAuditEvent) -> None:
    db.add(event)
