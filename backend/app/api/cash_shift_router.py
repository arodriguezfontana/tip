from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, has_cash_access, require_cash_pin
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


@router.get("/current", dependencies=[Depends(get_current_admin)])
def get_current_cash_shift_status(
    db: Session = Depends(get_db),
    can_see_amounts: bool = Depends(has_cash_access),
) -> CashShiftCurrentStatusResponse:
    """Estado de la caja en tiempo real: si está abierta o cerrada, y los totales acumulados del turno actual."""
    report = cash_shift_service.get_current_shift_report(db)
    if report is None:
        return CashShiftCurrentStatusResponse(is_open=False)
    # Protege los datos financieros pero informa si la caja está abierta para tomar pedidos
    shift = CashShiftDetailResponse.from_report(report) if can_see_amounts else None
    return CashShiftCurrentStatusResponse(is_open=True, shift=shift)


@router.post(
    "/open",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_cash_pin)],
)
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


@router.post("/close", dependencies=[Depends(require_cash_pin)])
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


@router.post(
    "/movements",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_cash_pin)],
)
def add_cash_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> CashMovementResponse:
    """Asienta un ingreso o egreso manual de dinero no vinculado a comandas."""
    movement = cash_shift_service.add_movement(
        db=db,
        amount=payload.amount,
        movement_type=payload.type,
        category=payload.category,
        description=payload.description,
        user_id=current_user.id,
    )
    return CashMovementResponse.from_model(movement)


@router.delete(
    "/movements/{movement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin), Depends(require_cash_pin)],
)
def delete_cash_movement(
    movement_id: int,
    db: Session = Depends(get_db),
) -> None:
    """Elimina un movimiento registrado por error (solo mientras la caja siga abierta)."""
    cash_shift_service.delete_movement(db, movement_id)


@router.get(
    "",
    dependencies=[Depends(get_current_admin), Depends(require_cash_pin)],
)
def list_cash_shifts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> CashShiftHistoryResponse:
    """Historial de turnos de caja anteriores."""
    return CashShiftHistoryResponse.from_page(cash_shift_service.list_shift_reports(db, limit=limit, offset=offset))


@router.get(
    "/{shift_id}",
    dependencies=[Depends(get_current_admin), Depends(require_cash_pin)],
)
def get_cash_shift_detail(
    shift_id: int,
    db: Session = Depends(get_db),
) -> CashShiftDetailResponse:
    """Detalle completo de un turno de caja específico."""
    return CashShiftDetailResponse.from_report(cash_shift_service.get_shift_report(db, shift_id))
