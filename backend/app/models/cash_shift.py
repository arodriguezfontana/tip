from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from sqlalchemy.sql import func

from app.core.money import MoneyColumn, to_money
from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.user import User


class CashShiftStatus(str, Enum):
    OPEN = "abierta"
    CLOSED = "cerrada"


class MovementType(str, Enum):
    INCOME = "ingreso"
    EXPENSE = "egreso"


class CashShift(Base):
    """Turno de caja del local.

    Registra el fondo inicial en efectivo al abrir, los movimientos manuales y las ventas del turno,
    y al cerrar compara el dinero real contado con la caja teórica para registrar faltantes o sobrantes.
    Una vez cerrada, el turno y sus operaciones quedan sellados e inmutables.
    """

    __tablename__ = "cash_shifts"
    __table_args__ = (
        CheckConstraint(
            f"status IN ('{CashShiftStatus.OPEN.value}', '{CashShiftStatus.CLOSED.value}')",
            name="ck_cash_shifts_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Fondo inicial en efectivo declarado al abrir
    initial_amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False, default=0)
    # Monto real físico contado al cerrar
    final_amount: Mapped[Decimal | None] = mapped_column(MoneyColumn, nullable=True)
    # Caja teórica calculada por el sistema al momento del cierre
    expected_amount: Mapped[Decimal | None] = mapped_column(MoneyColumn, nullable=True)
    # Diferencia = final_amount - expected_amount (positivo = sobrante, negativo = faltante)
    difference: Mapped[Decimal | None] = mapped_column(MoneyColumn, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=CashShiftStatus.OPEN.value, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    opened_by_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    closed_by_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    opened_by: Mapped["User | None"] = relationship("User", foreign_keys=[opened_by_id])
    closed_by: Mapped["User | None"] = relationship("User", foreign_keys=[closed_by_id])

    movements: Mapped[list["CashMovement"]] = relationship(
        "CashMovement",
        back_populates="shift",
        cascade="all, delete-orphan",
        order_by="CashMovement.created_at.desc()",
    )
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="cash_shift")

    @validates("initial_amount", "final_amount", "expected_amount", "difference")
    def _as_money(self, _key: str, value) -> Decimal | None:
        return None if value is None else to_money(value)

    @property
    def is_open(self) -> bool:
        return self.status == CashShiftStatus.OPEN.value

    @property
    def difference_type(self) -> str | None:
        if self.difference is None:
            return None
        diff = to_money(self.difference)
        if diff > 0:
            return "sobrante"
        if diff < 0:
            return "faltante"
        return "exacta"


class CashMovement(Base):
    """Movimiento manual de dinero en efectivo (ingreso o egreso) no vinculado directamente a comandas."""

    __tablename__ = "cash_movements"
    __table_args__ = (
        CheckConstraint(
            f"type IN ('{MovementType.INCOME.value}', '{MovementType.EXPENSE.value}')",
            name="ck_cash_movements_type",
        ),
        CheckConstraint("amount > 0", name="ck_cash_movements_amount"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cash_shift_id: Mapped[int] = mapped_column(Integer, ForeignKey("cash_shifts.id", ondelete="CASCADE"), nullable=False, index=True)

    amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'ingreso' | 'egreso'
    category: Mapped[str] = mapped_column(String(100), nullable=False)  # ej. 'Pago a proveedor', 'Adelanto de sueldo', 'Compra de insumos'
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_by_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    shift: Mapped["CashShift"] = relationship("CashShift", back_populates="movements")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id])

    @validates("amount")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)
