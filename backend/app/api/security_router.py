from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.security_schemas import (
    PinStatusResponse,
    PinVerificationRequest,
    PinVerificationResponse,
)
from app.services import security_service

router = APIRouter()


@router.post("/verify-admin-pin", response_model=PinVerificationResponse)
def verify_admin_pin_endpoint(
    payload: PinVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PinVerificationResponse:
    """Verifica el PIN de administración de 4 dígitos para acceder a estadísticas y reportes sensibles."""
    ip = request.client.host if request.client else None
    result = security_service.verify_pin(
        db=db,
        pin=payload.pin,
        pin_type="admin",
        user_id=current_user.id,
        ip_address=ip,
    )
    return PinVerificationResponse(**result)


@router.post("/verify-cash-pin", response_model=PinVerificationResponse)
def verify_cash_pin_endpoint(
    payload: PinVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> PinVerificationResponse:
    """Verifica el PIN de caja de 4 dígitos para acceder al control de caja."""
    ip = request.client.host if request.client else None
    result = security_service.verify_pin(
        db=db,
        pin=payload.pin,
        pin_type="cash",
        user_id=current_user.id,
        ip_address=ip,
    )
    return PinVerificationResponse(**result)


@router.get("/pin-status", response_model=PinStatusResponse)
def get_pin_status_endpoint(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin),
) -> PinStatusResponse:
    """Consulta si los PINs están configurados y si hay bloqueos temporales activos."""
    return PinStatusResponse(**security_service.get_pin_status(db))

