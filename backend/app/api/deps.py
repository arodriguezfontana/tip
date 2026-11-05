from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token, decode_privileged_token
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import get_active_user
from app.services.security_service import is_pin_blocked
from app.services.store_config_service import get_or_create_store_config

bearer_scheme = HTTPBearer(auto_error=False)


def _user_from_credentials(credentials: HTTPAuthorizationCredentials | None, db: Session) -> User | None:
    """Devuelve el usuario activo del token, o None si no hay token o es inválido."""
    if credentials is None:
        return None
    try:
        user_id = decode_access_token(credentials.credentials).get("sub")
    except JWTError:
        return None
    if user_id is None:
        return None

    return get_active_user(db, int(user_id))


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    user = _user_from_credentials(credentials, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Para endpoints públicos: identifica al usuario si mandó un token válido, sin exigirlo."""
    return _user_from_credentials(credentials, db)


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso exclusivo para administradores")
    return current_user


def get_current_customer(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_customer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso exclusivo para clientes")
    return current_user


def require_admin_pin(
    _admin: User = Depends(get_current_admin),
    x_privileged_token: str | None = Header(None, alias="X-Privileged-Token"),
    x_admin_pin: str | None = Header(None, alias="X-Admin-PIN"),
    db: Session = Depends(get_db),
) -> None:
    """Exige token de autorización o PIN de administración para acceder a métricas y reportes sensibles."""
    if x_privileged_token:
        try:
            payload = decode_privileged_token(x_privileged_token)
            if payload.get("scope") == "privileged:admin":
                return
        except JWTError:
            pass

    if x_admin_pin:
        blocked, _ = is_pin_blocked(db, "admin")
        if not blocked and x_admin_pin == settings.ADMIN_PIN:
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Se requiere PIN de administración para acceder a estadísticas y reportes.",
    )


def require_cash_pin(
    _admin: User = Depends(get_current_admin),
    x_cash_privileged_token: str | None = Header(None, alias="X-Cash-Privileged-Token"),
    x_privileged_token: str | None = Header(None, alias="X-Privileged-Token"),
    x_cash_pin: str | None = Header(None, alias="X-Cash-PIN"),
    db: Session = Depends(get_db),
) -> None:
    """Exige token de autorización o PIN de caja cuando la protección de caja está habilitada."""
    config = get_or_create_store_config(db)
    if not config.cash_pin_enabled:
        return

    for token in (x_cash_privileged_token, x_privileged_token):
        if token:
            try:
                payload = decode_privileged_token(token)
                if payload.get("scope") in ("privileged:cash", "privileged:admin"):
                    return
            except JWTError:
                pass

    if x_cash_pin:
        blocked, _ = is_pin_blocked(db, "cash")
        if not blocked and x_cash_pin == config.cash_pin:
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Se requiere PIN de caja para acceder o realizar operaciones de caja.",
    )
