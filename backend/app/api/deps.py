from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import get_active_user

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
