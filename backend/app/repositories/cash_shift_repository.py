from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.cash_shift import CashMovement, CashShift, CashShiftStatus


def get_open_shift(db: Session) -> CashShift | None:
    """Devuelve el turno de caja actualmente abierto, o None si no hay ninguno."""
    return (
        db.query(CashShift)
        .options(
            selectinload(CashShift.movements),
            joinedload(CashShift.opened_by),
            selectinload(CashShift.orders),
        )
        .filter(CashShift.status == CashShiftStatus.OPEN.value)
        .order_by(CashShift.opened_at.desc())
        .first()
    )


def get_by_id(db: Session, shift_id: int) -> CashShift | None:
    return (
        db.query(CashShift)
        .options(
            selectinload(CashShift.movements),
            joinedload(CashShift.opened_by),
            joinedload(CashShift.closed_by),
            selectinload(CashShift.orders),
        )
        .filter(CashShift.id == shift_id)
        .first()
    )


def list_shifts(db: Session, limit: int = 20, offset: int = 0) -> list[CashShift]:
    """Historial de turnos de caja, del más reciente al más antiguo."""
    return (
        db.query(CashShift)
        .options(
            joinedload(CashShift.opened_by),
            joinedload(CashShift.closed_by),
            selectinload(CashShift.movements),
            selectinload(CashShift.orders),
        )
        .order_by(CashShift.opened_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_shifts(db: Session) -> int:
    return db.scalar(select(func.count(CashShift.id))) or 0


def add_shift(db: Session, shift: CashShift) -> None:
    db.add(shift)


def get_movement(db: Session, movement_id: int) -> CashMovement | None:
    return (
        db.query(CashMovement)
        .options(joinedload(CashMovement.shift), joinedload(CashMovement.created_by))
        .filter(CashMovement.id == movement_id)
        .first()
    )


def delete_movement(db: Session, movement: CashMovement) -> None:
    db.delete(movement)
