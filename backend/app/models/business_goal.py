from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, validates
from sqlalchemy.sql import func

from app.core.money import MoneyColumn, to_money
from app.db.base_class import Base


class BusinessGoal(Base):
    """Metas comerciales cuantitativas definidas por el dueño para evaluar el rendimiento del negocio."""

    __tablename__ = "business_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # 'daily', 'weekly', 'monthly'
    period_type: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    target_revenue: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False, default=0, server_default="0")
    target_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @validates("target_revenue")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)
