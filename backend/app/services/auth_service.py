from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.modules.user import User


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Valida credenciales. Lanza 401 si son inválidas o el usuario está inactivo."""
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
    return user
