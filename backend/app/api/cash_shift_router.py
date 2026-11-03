from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
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

router = APIRouter()


@router.get("/current", response_model=CashShiftCurrentStatusResponse)
def get_current_cash_shift_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> CashShiftCurrentStatusResponse:
    """Estado de la caja en tiempo real: si está abierta o cerrada, y los totales acumulados del turno actual."""
    return cash_shift_service.get_current_shift_status(db)


@router.post("/open", response_model=CashShiftResponse, status_code=status.HTTP_201_CREATED)
def open_cash_shift(
    payload: CashShiftOpenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
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
) -> None:
    """Elimina un movimiento registrado por error (solo mientras la caja siga abierta)."""
    cash_shift_service.delete_movement(db, movement_id)


@router.get("", response_model=CashShiftHistoryResponse)
def list_cash_shifts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> CashShiftHistoryResponse:
    """Historial de turnos de caja anteriores."""
    return cash_shift_service.list_shifts(db, limit=limit, offset=offset)


@router.get("/{shift_id}", response_model=CashShiftDetailResponse)
def get_cash_shift_detail(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> CashShiftDetailResponse:
    """Detalle completo de un turno de caja específico."""
    return cash_shift_service.get_shift_detail(db, shift_id)

