"""Cuentas de usuario: inicio de sesión, registro de clientes de la web y sus datos personales."""

from sqlalchemy.orm import Session

from app.core.errors import AuthenticationError, ConflictError
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import transaction
from app.modules.user import ROLE_CUSTOMER, User
from app.repositories import user_repository


def issue_token(user: User) -> str:
    return create_access_token(subject=str(user.id), role=user.role)


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Valida las credenciales del usuario y que siga activo."""
    user = user_repository.find_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise AuthenticationError("Credenciales inválidas")
    if not user.is_active:
        raise AuthenticationError("Usuario inactivo")
    return user


def get_active_user(db: Session, user_id: int) -> User | None:
    """El usuario de una sesión, si todavía existe y está activo."""
    user = user_repository.get(db, user_id)
    return user if user is not None and user.is_active else None


def register_customer(
    db: Session, email: str, password: str, full_name: str, phone: str, address: str
) -> User:
    """Crea la cuenta de un cliente de la web. El email no puede estar registrado."""
    if user_repository.find_by_email(db, email):
        raise ConflictError("Ya existe una cuenta con ese email.")

    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        role=ROLE_CUSTOMER,
        is_active=True,
    )
    user.update_profile(full_name, phone, address)
    with transaction(db):
        user_repository.add(db, user)
    db.refresh(user)
    return user


def update_customer_profile(db: Session, customer: User, full_name: str, phone: str, address: str) -> User:
    with transaction(db):
        customer.update_profile(full_name, phone, address)
    db.refresh(customer)
    return customer
