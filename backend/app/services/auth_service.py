from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.user import ROLE_CUSTOMER, User
from app.schemas.customer_schemas import CustomerProfileUpdate, CustomerRegisterRequest


def _find_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Valida credenciales. Lanza 401 si son inválidas o el usuario está inactivo."""
    user = _find_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
    return user


def register_customer(db: Session, payload: CustomerRegisterRequest) -> User:
    """Crea la cuenta de un cliente de la web. Lanza 409 si el email ya está registrado."""
    if _find_by_email(db, payload.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese email.")

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        role=ROLE_CUSTOMER,
        is_active=True,
        full_name=payload.full_name,
        phone=payload.phone,
        address=payload.address,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_customer_profile(db: Session, customer: User, payload: CustomerProfileUpdate) -> User:
    customer.full_name = payload.full_name
    customer.phone = payload.phone
    customer.address = payload.address
    db.commit()
    db.refresh(customer)
    return customer
