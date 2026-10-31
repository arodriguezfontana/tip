from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

from app.core.money import MoneyColumn, to_money
from app.db.base_class import Base


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

    id = Column(Integer, primary_key=True, index=True)
    opened_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # Fondo inicial en efectivo declarado al abrir
    initial_amount = Column(MoneyColumn, nullable=False, default=0)
    # Monto real físico contado al cerrar
    final_amount = Column(MoneyColumn, nullable=True)
    # Caja teórica calculada por el sistema al momento del cierre
    expected_amount = Column(MoneyColumn, nullable=True)
    # Diferencia = final_amount - expected_amount (positivo = sobrante, negativo = faltante)
    difference = Column(MoneyColumn, nullable=True)

    status = Column(String(20), nullable=False, default=CashShiftStatus.OPEN.value, index=True)
    notes = Column(Text, nullable=True)

    opened_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    closed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    opened_by = relationship("User", foreign_keys=[opened_by_id])
    closed_by = relationship("User", foreign_keys=[closed_by_id])

    movements = relationship(
        "CashMovement",
        back_populates="shift",
        cascade="all, delete-orphan",
        order_by="CashMovement.created_at.desc()",
    )
    orders = relationship("Order", back_populates="cash_shift")

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

    id = Column(Integer, primary_key=True, index=True)
    cash_shift_id = Column(Integer, ForeignKey("cash_shifts.id", ondelete="CASCADE"), nullable=False, index=True)

    amount = Column(MoneyColumn, nullable=False)
    type = Column(String(20), nullable=False)  # 'ingreso' | 'egreso'
    category = Column(String(100), nullable=False)  # ej. 'Pago a proveedor', 'Adelanto de sueldo', 'Compra de insumos'
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    shift = relationship("CashShift", back_populates="movements")
    created_by = relationship("User", foreign_keys=[created_by_id])

    @validates("amount")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)
