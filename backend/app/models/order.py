from collections.abc import Iterable
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING, ClassVar

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, false
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

from app.core.errors import BusinessRuleError, ConflictError
from app.core.money import MoneyColumn, to_money
from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.menu import Product


class _StrEnum(str, Enum):
    """Enum cuyos valores son los textos guardados en la base (Python 3.10 no trae StrEnum)."""

    def __str__(self) -> str:
        return self.value


class OrderStatus(_StrEnum):
    PENDING = "Pendiente"
    CONFIRMED = "Confirmado"
    ON_THE_WAY = "En Camino"
    READY_FOR_PICKUP = "Listo para Retirar"
    COMPLETED = "Finalizado"
    REJECTED = "Rechazado"


class DeliveryMethod(_StrEnum):
    DELIVERY = "domicilio"
    PICKUP = "retiro"


class OrderSource(_StrEnum):
    BOT = "bot"
    WEB = "web"
    COUNTER = "mostrador"


class PaymentMethod(_StrEnum):
    CASH = "efectivo"
    TRANSFER = "transferencia"
    CARD = "tarjeta"
    MERCADOPAGO = "mercadopago"


def _values(enum: type[Enum]) -> tuple[str, ...]:
    return tuple(member.value for member in enum)


# Máximo de unidades de un mismo producto en un pedido, para todos los canales.
MAX_QUANTITY_PER_ITEM = 20
PICKUP_ADDRESS = "Retiro en el local"


class InvalidOrderError(BusinessRuleError):
    """El pedido no puede registrarse porque sus datos no son válidos contra el menú actual."""


class InvalidTransitionError(ConflictError):
    def __init__(self, current_status: str, new_status: str):
        super().__init__(f"No se puede pasar de '{current_status}' a '{new_status}'.")


class ScheduledOrderEstimateError(BusinessRuleError):
    def __init__(self):
        super().__init__("Los pedidos programados se entregan en su horario y no llevan demora estimada.")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN {_values(OrderStatus)}", name="ck_orders_status"),
        CheckConstraint(f"delivery_method IN {_values(DeliveryMethod)}", name="ck_orders_delivery_method"),
        CheckConstraint(f"source IN {_values(OrderSource)}", name="ck_orders_source"),
        CheckConstraint(f"payment_method IN {_values(PaymentMethod)}", name="ck_orders_payment_method"),
    )

    # Ciclo de vida del pedido: a qué estados puede pasar desde cada uno.
    ALLOWED_TRANSITIONS: ClassVar[dict[OrderStatus, frozenset[OrderStatus]]] = {
        OrderStatus.PENDING: frozenset({OrderStatus.CONFIRMED, OrderStatus.REJECTED}),
        OrderStatus.CONFIRMED: frozenset({OrderStatus.ON_THE_WAY, OrderStatus.READY_FOR_PICKUP}),
        OrderStatus.ON_THE_WAY: frozenset({OrderStatus.COMPLETED}),
        OrderStatus.READY_FOR_PICKUP: frozenset({OrderStatus.COMPLETED}),
        OrderStatus.COMPLETED: frozenset(),
        OrderStatus.REJECTED: frozenset(),
    }

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String(150), nullable=False)
    shipping_address = Column(String(255), nullable=False)
    # Total a pagar: suma de los productos más el costo de envío.
    total_amount = Column(MoneyColumn, nullable=False)
    shipping_cost = Column(MoneyColumn, nullable=False, default=0, server_default="0")
    # Sin informar (None) en los pedidos del bot y de la web, que se cobran al entregar.
    payment_method = Column(String(20), nullable=True)
    is_paid = Column(Boolean, nullable=False, default=False, server_default=false())
    status = Column(String(50), nullable=False, default=OrderStatus.PENDING.value)
    delivery_method = Column(String(20), nullable=False, server_default=DeliveryMethod.DELIVERY.value)
    telegram_chat_id = Column(String(32), nullable=True)
    customer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    delivery_driver_id = Column(
        Integer, ForeignKey("delivery_drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source = Column(String(20), nullable=False, default=OrderSource.BOT.value, server_default=OrderSource.BOT.value)
    customer_phone = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)
    estimated_minutes = Column(Integer, nullable=True)
    scheduled_for = Column(DateTime(timezone=True), nullable=True)
    mp_preference_id = Column(String(100), nullable=True)
    mp_payment_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    delivery_driver = relationship("DeliveryDriver", back_populates="orders")

    @validates("total_amount", "shipping_cost")
    def _as_money(self, _key: str, value) -> Decimal | None:
        return None if value is None else to_money(value)

    # --- Entrega ------------------------------------------------------------------------------------

    def set_delivery(self, method: DeliveryMethod | str, address: str | None) -> None:
        """Los retiros se registran con la dirección del local; los envíos exigen una dirección."""
        method = DeliveryMethod(method)
        if method == DeliveryMethod.DELIVERY and not (address or "").strip():
            raise InvalidOrderError("La dirección es obligatoria para envíos a domicilio.")
        self.delivery_method = method.value
        self.shipping_address = PICKUP_ADDRESS if method == DeliveryMethod.PICKUP else address.strip()

    # --- Productos y total --------------------------------------------------------------------------

    def set_items(self, lines: Iterable[tuple["Product", int]]) -> None:
        """Arma los ítems con los precios actuales del menú y recalcula el total.

        Valida las reglas comunes a todos los canales: que haya productos, que estén disponibles y que no
        se supere el máximo de unidades por producto. Las líneas de un mismo producto se suman.
        """
        quantities: dict[int, int] = {}
        products: dict[int, Product] = {}
        for product, quantity in lines:
            if quantity < 1:
                raise InvalidOrderError("Hay una cantidad inválida en el pedido.")
            products[product.id] = product
            quantities[product.id] = quantities.get(product.id, 0) + quantity
        if not quantities:
            raise InvalidOrderError("El pedido no tiene productos.")

        unavailable = [products[pid].name for pid in quantities if not products[pid].is_available]
        if unavailable:
            raise InvalidOrderError(f"Estos productos no están disponibles en este momento: {', '.join(unavailable)}.")
        exceeded = [products[pid].name for pid, qty in quantities.items() if qty > MAX_QUANTITY_PER_ITEM]
        if exceeded:
            raise InvalidOrderError(
                f"Superaste la cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: {', '.join(exceeded)}."
            )

        self.items = [
            OrderItem(product_id=pid, product=products[pid], quantity=qty, unit_price=products[pid].price)
            for pid, qty in quantities.items()
        ]
        self.total_amount = self.subtotal + (self.shipping_cost or Decimal(0))

    @property
    def subtotal(self) -> Decimal:
        """Suma de los productos, sin el envío."""
        return sum((item.subtotal for item in self.items), Decimal(0))

    @hybrid_property
    def is_billable(self) -> bool:
        """Cuenta como venta: todos los pedidos menos los rechazados."""
        return self.status != OrderStatus.REJECTED

    @is_billable.inplace.expression
    @classmethod
    def _is_billable_expression(cls):
        return cls.status != OrderStatus.REJECTED.value

    # --- Estado -------------------------------------------------------------------------------------

    def can_transition_to(self, new_status: OrderStatus | str) -> bool:
        return OrderStatus(new_status) in self.ALLOWED_TRANSITIONS[OrderStatus(self.status)]

    def transition_to(
        self, new_status: OrderStatus | str, estimated_minutes: int | None, current_delay_minutes: int
    ) -> None:
        """Avanza el pedido en su ciclo de vida.

        Al confirmar un pedido para ahora se registra la demora estimada: la indicada o, si no se indica,
        la demora actual del local. Los pedidos programados se entregan en su horario y no llevan demora.
        """
        new_status = OrderStatus(new_status)
        if not self.can_transition_to(new_status):
            raise InvalidTransitionError(self.status, new_status.value)

        if self.scheduled_for is not None:
            if estimated_minutes is not None:
                raise ScheduledOrderEstimateError()
        elif new_status == OrderStatus.CONFIRMED and estimated_minutes is None:
            estimated_minutes = current_delay_minutes

        self.status = new_status.value
        if estimated_minutes is not None:
            self.estimated_minutes = estimated_minutes


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(MoneyColumn, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")

    @validates("unit_price")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)

    @property
    def subtotal(self) -> Decimal:
        return self.unit_price * self.quantity
