from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BusinessRuleError, NotFoundError
from app.core.money import to_money
from app.db.session import transaction
from app.models.cash_shift import CashMovement, CashShift, CashShiftStatus
from app.models.order import PaymentMethod
from app.repositories import cash_shift_repository
from app.schemas.cash_shift_schemas import (
    CashShiftCurrentStatusResponse,
    CashShiftDetailResponse,
    CashShiftHistoryResponse,
    CashShiftResponse,
    CashShiftSummaryBreakdown,
)


def get_current_open_shift(db: Session) -> CashShift | None:
    return cash_shift_repository.get_open_shift(db)


def calculate_shift_summary(shift: CashShift) -> CashShiftSummaryBreakdown:
    initial = to_money(shift.initial_amount)
    manual_income = sum((to_money(m.amount) for m in shift.movements if m.type == "ingreso"), Decimal(0))
    manual_expense = sum((to_money(m.amount) for m in shift.movements if m.type == "egreso"), Decimal(0))

    cash_sales = Decimal("0.00")
    mercadopago_sales = Decimal("0.00")
    transferencia_sales = Decimal("0.00")
    tarjeta_sales = Decimal("0.00")
    other_digital_sales = Decimal("0.00")

    billable_orders = [o for o in shift.orders if o.is_billable]

    for order in billable_orders:
        amt = to_money(order.amount_paid) if not order.is_paid else to_money(order.total_amount)
        if amt <= 0:
            continue

        method = (order.balance_payment_method or order.payment_method or "").lower()
        if method == PaymentMethod.CASH.value or order.is_cash_payment:
            cash_sales += amt
        elif method == PaymentMethod.MERCADOPAGO.value:
            mercadopago_sales += amt
        elif method == PaymentMethod.TRANSFER.value:
            transferencia_sales += amt
        elif method == PaymentMethod.CARD.value:
            tarjeta_sales += amt
        else:
            other_digital_sales += amt

    total_digital_sales = mercadopago_sales + transferencia_sales + tarjeta_sales + other_digital_sales
    total_sales = cash_sales + total_digital_sales
    expected_cash = initial + cash_sales + manual_income - manual_expense

    final_amt = to_money(shift.final_amount) if shift.final_amount is not None else None
    diff = to_money(shift.difference) if shift.difference is not None else None
    diff_type = shift.difference_type

    return CashShiftSummaryBreakdown(
        initial_amount=float(initial),
        cash_sales=float(cash_sales),
        mercadopago_sales=float(mercadopago_sales),
        transferencia_sales=float(transferencia_sales),
        tarjeta_sales=float(tarjeta_sales),
        other_digital_sales=float(other_digital_sales),
        total_digital_sales=float(total_digital_sales),
        total_sales=float(total_sales),
        manual_income=float(manual_income),
        manual_expense=float(manual_expense),
        expected_cash=float(expected_cash),
        final_amount=float(final_amt) if final_amt is not None else None,
        difference=float(diff) if diff is not None else None,
        difference_type=diff_type,
        orders_count=len(billable_orders),
        movements_count=len(shift.movements),
    )


def get_current_shift_status(db: Session) -> CashShiftCurrentStatusResponse:
    shift = get_current_open_shift(db)
    if not shift:
        return CashShiftCurrentStatusResponse(is_open=False, shift=None)

    summary = calculate_shift_summary(shift)
    return CashShiftCurrentStatusResponse(
        is_open=True,
        shift=CashShiftDetailResponse.from_model_detail(shift, summary),
    )


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
    type: str,
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

    type_clean = type.strip().lower()
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
        db.add(movement)

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


def get_shift_detail(db: Session, shift_id: int) -> CashShiftDetailResponse:
    shift = cash_shift_repository.get_by_id(db, shift_id)
    if not shift:
        raise NotFoundError("Turno de caja no encontrado.")

    summary = calculate_shift_summary(shift)
    return CashShiftDetailResponse.from_model_detail(shift, summary)


def list_shifts(db: Session, limit: int = 20, offset: int = 0) -> CashShiftHistoryResponse:
    items = cash_shift_repository.list_shifts(db, limit, offset)
    total = cash_shift_repository.count_shifts(db)
    responses = [CashShiftResponse.from_model(s, calculate_shift_summary(s)) for s in items]
    return CashShiftHistoryResponse(items=responses, total=total)

