from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.delivery_driver import DeliveryDriver
    from app.models.order import Order


class DriverReview(Base):
    """Calificación y reseña anónima de un cliente sobre la entrega de un repartidor."""

    __tablename__ = "driver_reviews"
    __table_args__ = (
        CheckConstraint(
            "rating IS NULL OR (rating >= 1 AND rating <= 5)",
            name="ck_driver_reviews_rating_range",
        ),
        CheckConstraint(
            "rating IS NOT NULL OR (comment IS NOT NULL AND comment != '')",
            name="ck_driver_reviews_has_content",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    delivery_driver_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("delivery_drivers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    driver: Mapped["DeliveryDriver"] = relationship("DeliveryDriver", backref="reviews")
    order: Mapped["Order"] = relationship("Order", backref="driver_review")
