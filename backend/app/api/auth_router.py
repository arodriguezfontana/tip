from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_user
from app.db.session import get_db
from app.modules.user import User
from app.schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse
from app.schemas.customer_schemas import CustomerRegisterRequest
from app.services.auth_service import authenticate_user, register_customer
from app.core.security import create_access_token

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate_user(db, payload.email, payload.password)
    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: CustomerRegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Registro público de clientes de la web. Devuelve el token para dejar la sesión iniciada."""
    user = register_customer(db, payload)
    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.post("/refresh", response_model=TokenResponse)
def refresh_admin_token(current_admin: User = Depends(get_current_admin)) -> TokenResponse:
    """Renueva el token del administrador para que el panel no cierre la sesión mientras se usa."""
    token = create_access_token(subject=str(current_admin.id), role=current_admin.role)
    return TokenResponse(access_token=token, role=current_admin.role)


@router.get("/me", response_model=UserResponse)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
