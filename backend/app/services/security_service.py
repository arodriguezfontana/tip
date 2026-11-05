from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_privileged_token
from app.models.security import PinLockout, SecurityAuditEvent
from app.services.store_config_service import get_or_create_store_config


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_or_create_lockout(db: Session, pin_type: str) -> PinLockout:
    lockout = db.query(PinLockout).filter(PinLockout.pin_type == pin_type).first()
    if not lockout:
        lockout = PinLockout(pin_type=pin_type, failed_attempts=0, blocked_until=None)
        db.add(lockout)
        db.commit()
        db.refresh(lockout)
    return lockout


def is_pin_blocked(db: Session, pin_type: str) -> tuple[bool, int]:
    """Retorna (bloqueado, segundos_restantes)."""
    lockout = db.query(PinLockout).filter(PinLockout.pin_type == pin_type).first()
    if not lockout or not lockout.blocked_until:
        return False, 0
    now = datetime.now(timezone.utc)
    blocked_until = _ensure_utc(lockout.blocked_until)
    if blocked_until and blocked_until > now:
        remaining = int((blocked_until - now).total_seconds())
        return True, max(1, remaining)
    return False, 0


def verify_pin(
    db: Session,
    pin: str,
    pin_type: str,
    user_id: int | None = None,
    ip_address: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    lockout = _get_or_create_lockout(db, pin_type)

    blocked_until = _ensure_utc(lockout.blocked_until)
    if blocked_until:
        if blocked_until > now:
            remaining = int((blocked_until - now).total_seconds())
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso bloqueado temporalmente por 3 intentos fallidos consecutivos. Intente nuevamente en {remaining} segundos.",
            )
        lockout.failed_attempts = 0
        lockout.blocked_until = None

    if pin_type == "admin":
        target_pin = settings.ADMIN_PIN
    elif pin_type == "cash":
        config = get_or_create_store_config(db)
        if not config.cash_pin_enabled:
            token = create_privileged_token(
                subject=str(user_id or 0),
                scope="privileged:cash",
                expires_delta=timedelta(minutes=5),
            )
            return {"token": token, "expires_in": 300, "message": "PIN de caja no requerido"}
        target_pin = config.cash_pin or ""
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de PIN inválido")

    if pin == target_pin:
        lockout.failed_attempts = 0
        lockout.blocked_until = None
        db.add(
            SecurityAuditEvent(
                event_type="pin_unlocked",
                pin_type=pin_type,
                user_id=user_id,
                ip_address=ip_address,
                details=f"PIN de {pin_type} verificado correctamente.",
            )
        )
        db.commit()

        token = create_privileged_token(
            subject=str(user_id or 0),
            scope=f"privileged:{pin_type}",
            expires_delta=timedelta(minutes=5),
        )
        return {
            "token": token,
            "expires_in": 300,
            "message": "PIN verificado correctamente",
        }

    # PIN incorrecto
    lockout.failed_attempts += 1
    if lockout.failed_attempts >= 3:
        lockout.blocked_until = now + timedelta(minutes=5)
        db.add(
            SecurityAuditEvent(
                event_type="pin_blocked",
                pin_type=pin_type,
                user_id=user_id,
                ip_address=ip_address,
                details=f"3 intentos fallidos consecutivos de PIN de {pin_type}. Bloqueo temporal por 5 minutos.",
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso bloqueado temporalmente por 3 intentos fallidos consecutivos. Intente nuevamente en 5 minutos.",
        )

    remaining = 3 - lockout.failed_attempts
    db.add(
        SecurityAuditEvent(
            event_type="pin_failed",
            pin_type=pin_type,
            user_id=user_id,
            ip_address=ip_address,
            details=f"Intento fallido ({lockout.failed_attempts}/3) de PIN de {pin_type}.",
        )
    )
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"PIN incorrecto. Le quedan {remaining} intento{'s' if remaining > 1 else ''}.",
    )


def get_pin_status(db: Session) -> dict:
    admin_blocked, admin_remaining = is_pin_blocked(db, "admin")
    cash_blocked, cash_remaining = is_pin_blocked(db, "cash")
    config = get_or_create_store_config(db)

    return {
        "admin_pin_required": True,
        "admin_blocked": admin_blocked,
        "admin_blocked_seconds_remaining": admin_remaining,
        "cash_pin_required": bool(config.cash_pin_enabled),
        "cash_blocked": cash_blocked,
        "cash_blocked_seconds_remaining": cash_remaining,
    }
