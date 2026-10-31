from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.cash_shift import CashMovement, CashShift


class CashShiftOpenRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    initial_amount: float = Field(..., ge=0, description="Monto inicial en efectivo (fondo de caja)")
    notes: str | None = Field(None, max_length=500, description="Observaciones al abrir")


class CashShiftCloseRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    final_amount: float = Field(..., ge=0, description="Monto real en efectivo contado al finalizar")
    notes: str | None = Field(None, max_length=500, description="Observaciones al cerrar")


class CashMovementCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    amount: float = Field(..., gt=0, description="Monto en dinero físico")
    type: str = Field(..., pattern="^(ingreso|egreso)$", description="Tipo de movimiento: ingreso o egreso")
    category: str = Field(..., min_length=1, max_length=100, description="Categoría del movimiento")
    description: str | None = Field(None, max_length=500, description="Aclaraciones u observaciones")


class CashMovementResponse(BaseModel):
    id: int
    cash_shift_id: int
    amount: float
    type: str
    category: str
    description: str | None = None
    created_at: datetime
    created_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, mov: CashMovement) -> "CashMovementResponse":
        return cls(
            id=mov.id,
            cash_shift_id=mov.cash_shift_id,
            amount=float(mov.amount),
            type=mov.type,
            category=mov.category,
            description=mov.description,
            created_at=mov.created_at,
            created_by_name=mov.created_by.email if mov.created_by else None,
        )


class CashShiftSummaryBreakdown(BaseModel):
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
    final_amount: float | None = None
    difference: float | None = None
    difference_type: str | None = None
    orders_count: int = 0
    movements_count: int = 0


class CashShiftResponse(BaseModel):
    id: int
    opened_at: datetime
    closed_at: datetime | None = None
    status: str
    initial_amount: float
    final_amount: float | None = None
    expected_amount: float | None = None
    difference: float | None = None
    difference_type: str | None = None
    notes: str | None = None
    opened_by_name: str | None = None
    closed_by_name: str | None = None
    summary: CashShiftSummaryBreakdown | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, shift: CashShift, summary: CashShiftSummaryBreakdown | None = None) -> "CashShiftResponse":
        return cls(
            id=shift.id,
            opened_at=shift.opened_at,
            closed_at=shift.closed_at,
            status=shift.status,
            initial_amount=float(shift.initial_amount),
            final_amount=float(shift.final_amount) if shift.final_amount is not None else None,
            expected_amount=float(shift.expected_amount) if shift.expected_amount is not None else None,
            difference=float(shift.difference) if shift.difference is not None else None,
            difference_type=shift.difference_type,
            notes=shift.notes,
            opened_by_name=shift.opened_by.email if shift.opened_by else None,
            closed_by_name=shift.closed_by.email if shift.closed_by else None,
            summary=summary,
        )


class CashShiftDetailResponse(CashShiftResponse):
    movements: list[CashMovementResponse] = Field(default_factory=list)

    @classmethod
    def from_model_detail(
        cls, shift: CashShift, summary: CashShiftSummaryBreakdown | None = None
    ) -> "CashShiftDetailResponse":
        base = CashShiftResponse.from_model(shift, summary)
        return cls(
            **base.model_dump(),
            movements=[CashMovementResponse.from_model(m) for m in shift.movements] if shift.movements else [],
        )


class CashShiftCurrentStatusResponse(BaseModel):
    is_open: bool
    shift: CashShiftDetailResponse | None = None


class CashShiftHistoryResponse(BaseModel):
    items: list[CashShiftResponse]
    total: int

