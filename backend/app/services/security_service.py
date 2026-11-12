from datetime import datetime, timedelta, timezone
from typing import NoReturn

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BusinessRuleError, PermissionDeniedError
from app.core.security import create_privileged_token
from app.db.session import transaction
from app.models.security import PinLockout, SecurityAuditEvent
from app.repositories import security_repository
from app.services.store_config_service import get_or_create_store_config

PIN_TYPES = ("admin", "cash")
MAX_FAILED_ATTEMPTS = 3
LOCKOUT_DURATION = timedelta(minutes=5)
PRIVILEGED_TOKEN_DURATION = timedelta(minutes=5)


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_or_create_lockout(db: Session, pin_type: str) -> PinLockout:
    lockout = security_repository.get_lockout(db, pin_type)
    if lockout is None:
        lockout = PinLockout(pin_type=pin_type, failed_attempts=0, blocked_until=None)
        with transaction(db):
            security_repository.add_lockout(db, lockout)
        db.refresh(lockout)
    return lockout


def _seconds_blocked(lockout: PinLockout | None, now: datetime) -> int:
    """Segundos que faltan para que se levante el bloqueo; 0 si no está bloqueado."""
    blocked_until = _ensure_utc(lockout.blocked_until) if lockout else None
    if blocked_until is None or blocked_until <= now:
        return 0
    return max(1, int((blocked_until - now).total_seconds()))


def _clear_expired_block(lockout: PinLockout) -> None:
    """Un bloqueo que ya venció se levanta junto con los intentos fallidos que lo causaron."""
    if lockout.blocked_until:
        lockout.failed_attempts = 0
        lockout.blocked_until = None


def is_pin_blocked(db: Session, pin_type: str) -> tuple[bool, int]:
    """Retorna (bloqueado, segundos_restantes)."""
    remaining = _seconds_blocked(security_repository.get_lockout(db, pin_type), datetime.now(timezone.utc))
    return remaining > 0, remaining


def _expected_pin(db: Session, pin_type: str) -> str:
    if pin_type == "admin":
        return settings.ADMIN_PIN
    return get_or_create_store_config(db).cash_pin or ""


def _privileged_session(user_id: int | None, pin_type: str, message: str) -> dict:
    token = create_privileged_token(
        subject=str(user_id or 0),
        scope=f"privileged:{pin_type}",
        expires_delta=PRIVILEGED_TOKEN_DURATION,
    )
    return {"token": token, "expires_in": int(PRIVILEGED_TOKEN_DURATION.total_seconds()), "message": message}


def _audit_event(
    db: Session, event_type: str, pin_type: str, user_id: int | None, ip_address: str | None, details: str
) -> None:
    security_repository.add_audit_event(
        db,
        SecurityAuditEvent(
            event_type=event_type, pin_type=pin_type, user_id=user_id, ip_address=ip_address, details=details
        ),
    )


def _unlock(db: Session, lockout: PinLockout, pin_type: str, user_id: int | None, ip_address: str | None) -> dict:
    with transaction(db):
        lockout.failed_attempts = 0
        lockout.blocked_until = None
        _audit_event(db, "pin_unlocked", pin_type, user_id, ip_address, f"PIN de {pin_type} verificado correctamente.")
    return _privileged_session(user_id, pin_type, "PIN verificado correctamente")


def _failed_attempt_outcome(lockout: PinLockout, pin_type: str, now: datetime) -> tuple[str, str, str]:
    """Suma el intento fallido y devuelve (tipo de evento, detalle de la auditoría, mensaje para el usuario)."""
    lockout.failed_attempts += 1
    if lockout.failed_attempts >= MAX_FAILED_ATTEMPTS:
        lockout.blocked_until = now + LOCKOUT_DURATION
        return (
            "pin_blocked",
            f"{MAX_FAILED_ATTEMPTS} intentos fallidos consecutivos de PIN de {pin_type}. Bloqueo temporal por 5 minutos.",
            f"Acceso bloqueado temporalmente por {MAX_FAILED_ATTEMPTS} intentos fallidos consecutivos. Intente nuevamente en 5 minutos.",
        )
    remaining = MAX_FAILED_ATTEMPTS - lockout.failed_attempts
    return (
        "pin_failed",
        f"Intento fallido ({lockout.failed_attempts}/{MAX_FAILED_ATTEMPTS}) de PIN de {pin_type}.",
        f"PIN incorrecto. Le quedan {remaining} intento{'s' if remaining > 1 else ''}.",
    )


def _reject_wrong_pin(
    db: Session, lockout: PinLockout, pin_type: str, user_id: int | None, ip_address: str | None, now: datetime
) -> NoReturn:
    event_type, details, message = _failed_attempt_outcome(lockout, pin_type, now)
    with transaction(db):
        _audit_event(db, event_type, pin_type, user_id, ip_address, details)
    raise PermissionDeniedError(message)


def verify_pin(
    db: Session,
    pin: str,
    pin_type: str,
    user_id: int | None = None,
    ip_address: str | None = None,
) -> dict:
    if pin_type not in PIN_TYPES:
        raise BusinessRuleError("Tipo de PIN inválido")
    now = datetime.now(timezone.utc)
    lockout = _get_or_create_lockout(db, pin_type)

    remaining = _seconds_blocked(lockout, now)
    if remaining:
        raise PermissionDeniedError(
            f"Acceso bloqueado temporalmente por {MAX_FAILED_ATTEMPTS} intentos fallidos consecutivos. "
            f"Intente nuevamente en {remaining} segundos."
        )
    _clear_expired_block(lockout)

    if pin_type == "cash" and not get_or_create_store_config(db).cash_pin_enabled:
        return _privileged_session(user_id, pin_type, "PIN de caja no requerido")
    if pin == _expected_pin(db, pin_type):
        return _unlock(db, lockout, pin_type, user_id, ip_address)
    _reject_wrong_pin(db, lockout, pin_type, user_id, ip_address, now)


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
