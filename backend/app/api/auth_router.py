from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.modules.user import User
from app.schemas.auth_schemas import LoginRequest, TokenResponse, UserResponse
from app.services.auth_service import authenticate_user
from app.core.security import create_access_token

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate_user(db, payload.email, payload.password)
    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.get("/me", response_model=UserResponse)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
