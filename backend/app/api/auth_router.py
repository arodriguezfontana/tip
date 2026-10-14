from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse
from app.schemas.customer_schemas import CustomerRegisterRequest
from app.services import auth_service

router = APIRouter()


def _token_for(user: User) -> TokenResponse:
    return TokenResponse(access_token=auth_service.issue_token(user), role=user.role)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return _token_for(auth_service.authenticate_user(db, payload.email, payload.password))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: CustomerRegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Registro público de clientes de la web. Devuelve el token para dejar la sesión iniciada."""
    user = auth_service.register_customer(
        db,
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        phone=payload.phone,
        address=payload.address,
    )
    return _token_for(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh_admin_token(current_admin: User = Depends(get_current_admin)) -> TokenResponse:
    """Renueva el token del administrador para que el panel no cierre la sesión mientras se usa."""
    return _token_for(current_admin)


@router.get("/me", response_model=UserResponse)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
