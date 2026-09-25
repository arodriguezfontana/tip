from datetime import datetime
from sqlalchemy import CheckConstraint, Column, Float, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

ORDER_STATUSES = ("Pendiente", "Confirmado", "En Camino", "Listo para Retirar", "Finalizado", "Rechazado")
DELIVERY_METHODS = ("domicilio", "retiro")
ORDER_SOURCES = ("bot", "web")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN {ORDER_STATUSES}", name="ck_orders_status"),
        CheckConstraint(f"delivery_method IN {DELIVERY_METHODS}", name="ck_orders_delivery_method"),
        CheckConstraint(f"source IN {ORDER_SOURCES}", name="ck_orders_source"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String(150), nullable=False)
    shipping_address = Column(String(255), nullable=False)
    total_amount = Column(Float, nullable=False)
    status = Column(String(50), nullable=False, default="Pendiente")
    delivery_method = Column(String(20), nullable=False, server_default="domicilio")
    telegram_chat_id = Column(String(32), nullable=True)
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    source = Column(String(20), nullable=False, default="bot", server_default="bot")
    customer_phone = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)
    estimated_minutes = Column(Integer, nullable=True)
    scheduled_for = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")