from fastapi import APIRouter, Depends, Header, Query, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, require_cash_pin
from app.core.security import decode_privileged_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.cash_shift_schemas import (
    CashMovementCreate,
    CashMovementResponse,
    CashShiftCloseRequest,
    CashShiftCurrentStatusResponse,
    CashShiftDetailResponse,
    CashShiftHistoryResponse,
    CashShiftOpenRequest,
    CashShiftResponse,
)
from app.services import cash_shift_service
from app.services.security_service import is_pin_blocked
from app.services.store_config_service import get_or_create_store_config

router = APIRouter()


@router.get("/current", response_model=CashShiftCurrentStatusResponse)
def get_current_cash_shift_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    x_cash_privileged_token: str | None = Header(None, alias="X-Cash-Privileged-Token"),
    x_privileged_token: str | None = Header(None, alias="X-Privileged-Token"),
    x_cash_pin: str | None = Header(None, alias="X-Cash-PIN"),
) -> CashShiftCurrentStatusResponse:
    """Estado de la caja en tiempo real: si está abierta o cerrada, y los totales acumulados del turno actual."""
    status_data = cash_shift_service.get_current_shift_status(db)
    config = get_or_create_store_config(db)

    # Si la caja tiene protección por PIN activa, solo usuarios con PIN o token privilegiado ven los montos
    if config.cash_pin_enabled:
        authorized = False
        for token in (x_cash_privileged_token, x_privileged_token):
            if token:
                try:
                    payload = decode_privileged_token(token)
                    if payload.get("scope") in ("privileged:cash", "privileged:admin"):
                        authorized = True
                        break
                except JWTError:
                    pass
        if not authorized and x_cash_pin:
            blocked, _ = is_pin_blocked(db, "cash")
            if not blocked and x_cash_pin == config.cash_pin:
                authorized = True

        if not authorized:
            # Protege los datos financieros pero informa si la caja está abierta para tomar pedidos
            return CashShiftCurrentStatusResponse(is_open=status_data.is_open, shift=None)

    return status_data


@router.post("/open", response_model=CashShiftResponse, status_code=status.HTTP_201_CREATED)
def open_cash_shift(
    payload: CashShiftOpenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    _authorized: None = Depends(require_cash_pin),
) -> CashShiftResponse:
    """Apertura obligatoria de caja registrando el monto inicial en efectivo (fondo de caja)."""
    shift = cash_shift_service.open_shift(
        db=db,
        initial_amount=payload.initial_amount,
        user_id=current_user.id,
        notes=payload.notes,
    )
    summary = cash_shift_service.calculate_shift_summary(shift)
    return CashShiftResponse.from_model(shift, summary)


@router.post("/close", response_model=CashShiftResponse)
def close_cash_shift(
    payload: CashShiftCloseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    _authorized: None = Depends(require_cash_pin),
) -> CashShiftResponse:
    """Cierre de caja: compara el monto real contado contra la caja teórica y sella el turno."""
    shift = cash_shift_service.close_shift(
        db=db,
        final_amount=payload.final_amount,
        user_id=current_user.id,
        notes=payload.notes,
    )
    summary = cash_shift_service.calculate_shift_summary(shift)
    return CashShiftResponse.from_model(shift, summary)


@router.post("/movements", response_model=CashMovementResponse, status_code=status.HTTP_201_CREATED)
def add_cash_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    _authorized: None = Depends(require_cash_pin),
) -> CashMovementResponse:
    """Asienta un ingreso o egreso manual de dinero no vinculado a comandas."""
    movement = cash_shift_service.add_movement(
        db=db,
        amount=payload.amount,
        type=payload.type,
        category=payload.category,
        description=payload.description,
        user_id=current_user.id,
    )
    return CashMovementResponse.from_model(movement)


@router.delete("/movements/{movement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cash_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    _authorized: None = Depends(require_cash_pin),
) -> None:
    """Elimina un movimiento registrado por error (solo mientras la caja siga abierta)."""
    cash_shift_service.delete_movement(db, movement_id)


@router.get("", response_model=CashShiftHistoryResponse)
def list_cash_shifts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    _authorized: None = Depends(require_cash_pin),
) -> CashShiftHistoryResponse:
    """Historial de turnos de caja anteriores."""
    return cash_shift_service.list_shifts(db, limit=limit, offset=offset)


@router.get("/{shift_id}", response_model=CashShiftDetailResponse)
def get_cash_shift_detail(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
    _authorized: None = Depends(require_cash_pin),
) -> CashShiftDetailResponse:
    """Detalle completo de un turno de caja específico."""
    return cash_shift_service.get_shift_detail(db, shift_id)
