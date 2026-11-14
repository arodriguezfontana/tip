from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, NotFoundError
from app.core.money import to_money
from app.db.session import transaction
from app.models.cash_shift import CashMovement, CashShift, CashShiftStatus
from app.models.order import PaymentMethod
from app.repositories import cash_shift_repository


def get_current_open_shift(db: Session) -> CashShift | None:
    return cash_shift_repository.get_open_shift(db)


@dataclass(frozen=True)
class ShiftSummary:
    """Cómo viene la caja de un turno: lo cobrado por medio de pago, los movimientos manuales y el efectivo esperado."""

    initial_amount: float
    cash_sales: float
    mercadopago_sales: float
    transferencia_sales: float
    tarjeta_sales: float
    other_digital_sales: float
    total_digital_sales: float
    total_sales: float
    manual_income: float
    manual_expense: float
    expected_cash: float
    final_amount: float | None
    difference: float | None
    difference_type: str | None
    orders_count: int
    movements_count: int


@dataclass(frozen=True)
class ShiftReport:
    shift: CashShift
    summary: ShiftSummary


@dataclass(frozen=True)
class ShiftReportsPage:
    items: list[ShiftReport]
    total: int


# Dónde se suma lo cobrado con cada medio de pago; cualquier otro cuenta como cobro digital.
_SALES_BUCKET_BY_PAYMENT_METHOD = {
    PaymentMethod.CASH.value: "cash",
    PaymentMethod.MERCADOPAGO.value: "mercadopago",
    PaymentMethod.TRANSFER.value: "transferencia",
    PaymentMethod.CARD.value: "tarjeta",
}


def _sales_by_bucket(orders: list) -> defaultdict[str, Decimal]:
    totals: defaultdict[str, Decimal] = defaultdict(Decimal)
    payments = [(method, amount) for order in orders for method, amount in order.collected_payments if amount > 0]
    for method, amount in payments:
        totals[_SALES_BUCKET_BY_PAYMENT_METHOD.get((method or "").lower(), "other_digital")] += amount
    return totals


def _optional_float(amount) -> float | None:
    return float(to_money(amount)) if amount is not None else None


def calculate_shift_summary(shift: CashShift) -> ShiftSummary:
    initial = to_money(shift.initial_amount)

    # Movimientos manuales que representan ventas digitales (transferencias o tarjetas)
    digital_transfer_movements = sum(
        (
            to_money(m.amount)
            for m in shift.movements
            if m.type == "ingreso" and "transferencia" in m.category.strip().lower()
        ),
        Decimal(0),
    )
    digital_card_movements = sum(
        (
            to_money(m.amount)
            for m in shift.movements
            if m.type == "ingreso" and "tarjeta" in m.category.strip().lower()
        ),
        Decimal(0),
    )

    # Ingresos manuales en efectivo físico (excluye las transferencias y tarjetas digitales)
    manual_income = sum(
        (
            to_money(m.amount)
            for m in shift.movements
            if m.type == "ingreso"
            and not any(k in m.category.strip().lower() for k in ("transferencia", "tarjeta"))
        ),
        Decimal(0),
    )
    manual_expense = sum((to_money(m.amount) for m in shift.movements if m.type == "egreso"), Decimal(0))

    billable_orders = [o for o in shift.orders if o.is_billable]
    sales = _sales_by_bucket(billable_orders)
    transferencia_sales = sales["transferencia"] + digital_transfer_movements
    tarjeta_sales = sales["tarjeta"] + digital_card_movements
    total_digital_sales = sales["mercadopago"] + transferencia_sales + tarjeta_sales + sales["other_digital"]
    expected_cash = initial + sales["cash"] + manual_income - manual_expense

    return ShiftSummary(
        initial_amount=float(initial),
        cash_sales=float(sales["cash"]),
        mercadopago_sales=float(sales["mercadopago"]),
        transferencia_sales=float(transferencia_sales),
        tarjeta_sales=float(tarjeta_sales),
        other_digital_sales=float(sales["other_digital"]),
        total_digital_sales=float(total_digital_sales),
        total_sales=float(sales["cash"] + total_digital_sales),
        manual_income=float(manual_income),
        manual_expense=float(manual_expense),
        expected_cash=float(expected_cash),
        final_amount=_optional_float(shift.final_amount),
        difference=_optional_float(shift.difference),
        difference_type=shift.difference_type,
        orders_count=len(billable_orders),
        movements_count=len(shift.movements),
    )


def get_current_shift_report(db: Session) -> ShiftReport | None:
    """El turno abierto con su resumen, o None si la caja está cerrada."""
    shift = get_current_open_shift(db)
    return ShiftReport(shift, calculate_shift_summary(shift)) if shift else None


def open_shift(
    db: Session,
    initial_amount: Decimal | float,
    user_id: int | None = None,
    notes: str | None = None,
) -> CashShift:
    existing = get_current_open_shift(db)
    if existing is not None:
        raise BusinessRuleError("Ya hay una caja abierta. Cerrá la caja actual antes de abrir un nuevo turno.")

    initial = to_money(initial_amount)
    if initial < 0:
        raise BusinessRuleError("El monto inicial debe ser mayor o igual a cero.")

    with transaction(db):
        shift = CashShift(
            initial_amount=initial,
            status=CashShiftStatus.OPEN.value,
            notes=notes.strip() if notes else None,
            opened_by_id=user_id,
        )
        cash_shift_repository.add_shift(db, shift)
    db.refresh(shift)
    return shift


def close_shift(
    db: Session,
    final_amount: Decimal | float,
    user_id: int | None = None,
    notes: str | None = None,
) -> CashShift:
    shift = get_current_open_shift(db)
    if not shift:
        raise BusinessRuleError("No hay ninguna caja abierta para cerrar.")

    summary = calculate_shift_summary(shift)
    real_amt = to_money(final_amount)
    if real_amt < 0:
        raise BusinessRuleError("El monto final declarado debe ser mayor o igual a cero.")

    expected = to_money(summary.expected_cash)
    diff = real_amt - expected

    with transaction(db):
        shift.final_amount = real_amt
        shift.expected_amount = expected
        shift.difference = diff
        shift.status = CashShiftStatus.CLOSED.value
        shift.closed_at = datetime.now(timezone.utc)
        shift.closed_by_id = user_id
        if notes and notes.strip():
            shift.notes = f"{shift.notes}\n{notes.strip()}".strip() if shift.notes else notes.strip()

    db.refresh(shift)
    return shift


def add_movement(
    db: Session,
    amount: Decimal | float,
    movement_type: str,
    category: str,
    description: str | None = None,
    user_id: int | None = None,
) -> CashMovement:
    shift = get_current_open_shift(db)
    if not shift:
        raise BusinessRuleError("No hay una caja abierta. Abrí la caja antes de registrar movimientos de dinero.")

    amt = to_money(amount)
    if amt <= 0:
        raise BusinessRuleError("El monto del movimiento debe ser mayor a cero.")

    type_clean = movement_type.strip().lower()
    if type_clean not in ("ingreso", "egreso"):
        raise BusinessRuleError("El tipo de movimiento debe ser 'ingreso' o 'egreso'.")

    if not category or not category.strip():
        raise BusinessRuleError("La categoría del movimiento es obligatoria.")

    with transaction(db):
        movement = CashMovement(
            cash_shift_id=shift.id,
            amount=amt,
            type=type_clean,
            category=category.strip(),
            description=description.strip() if description else None,
            created_by_id=user_id,
        )
        cash_shift_repository.add_movement(db, movement)

    db.refresh(movement)
    return movement


def delete_movement(db: Session, movement_id: int) -> None:
    movement = cash_shift_repository.get_movement(db, movement_id)
    if not movement:
        raise NotFoundError("Movimiento de caja no encontrado.")

    if not movement.shift.is_open:
        raise BusinessRuleError("No se pueden eliminar movimientos de un turno de caja cerrado.")

    with transaction(db):
        cash_shift_repository.delete_movement(db, movement)


def get_shift_report(db: Session, shift_id: int) -> ShiftReport:
    shift = cash_shift_repository.get_by_id(db, shift_id)
    if not shift:
        raise NotFoundError("Turno de caja no encontrado.")
    return ShiftReport(shift, calculate_shift_summary(shift))


def list_shift_reports(db: Session, limit: int = 20, offset: int = 0) -> ShiftReportsPage:
    shifts = cash_shift_repository.list_shifts(db, limit, offset)
    total = cash_shift_repository.count_shifts(db)
    return ShiftReportsPage([ShiftReport(s, calculate_shift_summary(s)) for s in shifts], total)
