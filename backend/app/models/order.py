import json
import re
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    false,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

from app.core.channels import Channel
from app.core.errors import BusinessRuleError, ConflictError
from app.core.money import MoneyColumn, to_money
from app.core.phone import normalize_phone
from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.menu import Product
    from app.models.promotion import Promotion


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
    # El local da de baja un pedido ya aceptado (o todavía sin responder) antes de entregarlo.
    CANCELLED = "Cancelado"


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


# Estados en los que el pedido no se llegó a vender: no suman a las ventas ni a las estadísticas.
_NOT_BILLABLE_STATUSES = (OrderStatus.REJECTED, OrderStatus.CANCELLED)


def _values(enum: type[Enum]) -> tuple[str, ...]:
    return tuple(member.value for member in enum)


# Máximo de unidades de un mismo producto en un pedido, para todos los canales.
MAX_QUANTITY_PER_ITEM = 20
PICKUP_ADDRESS = "Retiro en el local"


# Tiempo, desde que se registra el pedido, en el que el cliente todavía puede agregarle productos.
MODIFICATION_WINDOW = timedelta(minutes=10)

# Estados en los que el pedido todavía no salió: solo ahí se puede cambiar el medio de pago o sumar productos.
_MODIFIABLE_STATUSES = (OrderStatus.PENDING, OrderStatus.CONFIRMED)


class InvalidOrderError(BusinessRuleError):
    """El pedido no puede registrarse porque sus datos no son válidos contra el menú actual."""


class InvalidTransitionError(ConflictError):
    def __init__(self, current_status: str, new_status: str):
        super().__init__(f"No se puede pasar de '{current_status}' a '{new_status}'.")


class ModificationWindowClosedError(BusinessRuleError):
    def __init__(self):
        super().__init__("Pasaron más de 10 minutos desde que se registró el pedido: ya no se le pueden agregar productos.")


class OrderNotModifiableError(BusinessRuleError):
    """El pedido ya salió (en camino, listo para retirar) o terminó: no admite cambios."""


class PaymentChangeNotAllowedError(BusinessRuleError):
    """El medio de pago no se puede cambiar (ej. el pedido ya está abonado)."""


class ScheduledOrderEstimateError(BusinessRuleError):
    def __init__(self):
        super().__init__("Los pedidos programados se entregan en su horario y no llevan demora estimada.")


def clean_pizza_flavor(product_name: str) -> str:
    """Extrae el gusto de la pizza limpio (ej: 'Pizza Muzzarella' -> 'Muzzarella')."""
    nombre = product_name.strip()
    nombre = re.sub(r"^(?:pizza(?:s)?\s+)?(?:de\s+)?", "", nombre, flags=re.IGNORECASE)
    nombre = re.sub(r"(?:\s+(?:grande|chica|individual))$", "", nombre, flags=re.IGNORECASE)
    return nombre.strip().title()


def format_half_and_half_name(p1_name: str, p2_name: str, size_hint: str = "") -> str:
    """Formatea el nombre unificado de la pizza mitad y mitad (ej: 'Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]')."""
    f1 = clean_pizza_flavor(p1_name)
    f2 = clean_pizza_flavor(p2_name)
    hint = (size_hint or "").lower()
    p1_lower = p1_name.lower()
    p2_lower = p2_name.lower()
    base = (
        "Pizza Chica"
        if ("chica" in hint or "chica" in p1_lower or "chica" in p2_lower)
        else "Pizza Grande"
    )
    return f"{base} [1/2 {f1} | 1/2 {f2}]"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN {_values(OrderStatus)}", name="ck_orders_status"),
        CheckConstraint(f"delivery_method IN {_values(DeliveryMethod)}", name="ck_orders_delivery_method"),
        CheckConstraint(f"source IN {_values(OrderSource)}", name="ck_orders_source"),
        CheckConstraint(f"channel IN {_values(Channel)}", name="ck_orders_channel"),
        CheckConstraint(f"balance_payment_method IN {_values(PaymentMethod)}", name="ck_orders_balance_payment_method"),
        CheckConstraint(f"payment_method IN {_values(PaymentMethod)}", name="ck_orders_payment_method"),
    )

    # Ciclo de vida del pedido: a qué estados puede pasar desde cada uno.
    # Cualquier pedido que todavía no terminó se puede cancelar.
    ALLOWED_TRANSITIONS: ClassVar[dict[OrderStatus, frozenset[OrderStatus]]] = {
        OrderStatus.PENDING: frozenset({OrderStatus.CONFIRMED, OrderStatus.REJECTED, OrderStatus.CANCELLED}),
        OrderStatus.CONFIRMED: frozenset({OrderStatus.ON_THE_WAY, OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED}),
        OrderStatus.ON_THE_WAY: frozenset({OrderStatus.COMPLETED, OrderStatus.CANCELLED}),
        OrderStatus.READY_FOR_PICKUP: frozenset({OrderStatus.COMPLETED, OrderStatus.CANCELLED}),
        OrderStatus.COMPLETED: frozenset(),
        OrderStatus.REJECTED: frozenset(),
        OrderStatus.CANCELLED: frozenset(),
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
    # Parte del total ya cobrada cuando el pedido no está abonado del todo: pasa al agregarle productos a un
    # pedido que ya se había pagado. Con el pedido abonado (is_paid) se paga el total y este campo no se usa.
    paid_amount = Column(MoneyColumn, nullable=False, default=0, server_default="0")
    # Cómo se salda la diferencia de un pago parcial (efectivo al recibir o link de MercadoPago).
    balance_payment_method = Column(String(20), nullable=True)
    # Se agregaron productos y cocina todavía no lo vio (alerta en el tablero de comandas).
    kitchen_update_pending = Column(Boolean, nullable=False, default=False, server_default=false())
    status = Column(String(50), nullable=False, default=OrderStatus.PENDING.value)
    delivery_method = Column(String(20), nullable=False, server_default=DeliveryMethod.DELIVERY.value)
    # Pedidos del bot: canal por el que habló el cliente y su chat en ese canal (para avisarle novedades).
    channel = Column(String(20), nullable=True)
    chat_id = Column(String(32), nullable=True)
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

    @validates("customer_phone")
    def _normalize_phone(self, _key: str, phone: str | None) -> str | None:
        return normalize_phone(phone) or None if phone is not None else None

    @validates("total_amount", "shipping_cost", "paid_amount")
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

    def set_items(self, lines: Iterable[tuple]) -> None:
        """Arma los ítems con los precios actuales del menú y recalcula el total.

        Valida las reglas comunes a todos los canales: que haya productos o promociones, que estén disponibles y que no
        se supere el máximo de unidades por producto. Las líneas de un mismo producto o promoción se suman.
        """
        parsed_lines: list[tuple[Any, int, Any, str | None, list[dict], Any]] = []
        for line in lines:
            promotion = None
            if len(line) == 2:
                product, quantity = line
                secondary_product, custom_name, mods = None, None, []
            elif len(line) == 4:
                product, quantity, secondary_product, custom_name = line[:4]
                mods = []
            elif len(line) == 5:
                product, quantity, secondary_product, custom_name = line[:4]
                mods = list(line[4]) if line[4] else []
            else:
                product, quantity, secondary_product, custom_name = line[:4]
                mods = list(line[4]) if line[4] else []
                promotion = line[5] if len(line) > 5 else None
            if quantity < 1:
                raise InvalidOrderError("Hay una cantidad inválida en el pedido.")
            parsed_lines.append((product, quantity, secondary_product, custom_name, mods, promotion))

        if not parsed_lines:
            raise InvalidOrderError("El pedido no tiene productos.")

        consolidated: dict[tuple, tuple[Any, Any, str | None, Decimal, int, list[dict], Any]] = {}
        for p1, qty, p2, cname, mods, promo in parsed_lines:
            if promo is not None:
                cname = cname or promo.name
                mods_key = json.dumps(mods, sort_keys=True) if mods else ""
                key = ("promo", promo.id, cname, mods_key)
                price = promo.price
            else:
                cname = cname or (format_half_and_half_name(p1.name, p2.name) if p2 else None)
                mods_key = json.dumps(mods, sort_keys=True) if mods else ""
                key = (p1.id, p2.id if p2 else None, cname, mods_key)
                base_price = max(p1.price, p2.price) if p2 else p1.price
                extra_cost = sum(
                    to_money(m.get("price", 0))
                    for m in mods
                    if (m.get("type") in ("positive", "extra", "add") or m.get("action") == "add") and m.get("price")
                )
                price = base_price + extra_cost

            if key in consolidated:
                prev_p1, prev_p2, prev_name, prev_price, prev_qty, prev_mods, prev_promo = consolidated[key]
                consolidated[key] = (prev_p1, prev_p2, prev_name, prev_price, prev_qty + qty, prev_mods, prev_promo)
            else:
                consolidated[key] = (p1, p2, cname, price, qty, mods, promo)

        unavailable = []
        for p1, p2, _, _, _, _, promo in consolidated.values():
            if promo is not None:
                if not promo.is_available:
                    unavailable.append(promo.name)
            else:
                if p1 is not None and not p1.is_available:
                    unavailable.append(p1.name)
                if p2 is not None and not p2.is_available:
                    unavailable.append(p2.name)
        if unavailable:
            raise InvalidOrderError(
                f"Estos productos no están disponibles en este momento: {', '.join(dict.fromkeys(unavailable))}."
            )

        exceeded = []
        for p1, _p2, cname, _, qty, _, promo in consolidated.values():
            if qty > MAX_QUANTITY_PER_ITEM:
                exceeded.append(cname or (promo.name if promo else (p1.name if p1 else "")))
        if exceeded:
            raise InvalidOrderError(
                f"Superaste la cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: {', '.join(exceeded)}."
            )

        self.items = [
            OrderItem(
                product_id=p1.id if p1 else None,
                secondary_product_id=p2.id if p2 else None,
                promotion_id=promo.id if promo else None,
                product=p1,
                secondary_product=p2,
                promotion=promo,
                quantity=qty,
                unit_price=price,
                custom_name=cname,
                modifications=mods,
            )
            for p1, p2, cname, price, qty, mods, promo in consolidated.values()
        ]
        self.total_amount = self.subtotal + (self.shipping_cost or Decimal(0))

    @property
    def subtotal(self) -> Decimal:
        """Suma de los productos, sin el envío."""
        return sum((item.subtotal for item in self.items), Decimal(0))

    @hybrid_property
    def is_billable(self) -> bool:
        """Cuenta como venta: todos los pedidos menos los rechazados y los cancelados."""
        return self.status not in _NOT_BILLABLE_STATUSES

    @is_billable.inplace.expression
    @classmethod
    def _is_billable_expression(cls):
        return cls.status.notin_([status.value for status in _NOT_BILLABLE_STATUSES])

    # --- Pagos --------------------------------------------------------------------------------------

    @property
    def amount_paid(self) -> Decimal:
        """Lo que el cliente ya pagó: el total si el pedido está abonado, o el pago parcial."""
        return to_money(self.total_amount) if self.is_paid else to_money(self.paid_amount or 0)

    @property
    def amount_pending(self) -> Decimal:
        """Lo que falta cobrar (por ejemplo, la diferencia que se paga al recibir el pedido)."""
        return max(to_money(self.total_amount) - self.amount_paid, Decimal(0))

    @property
    def is_cash_payment(self) -> bool:
        """El último cobro fue en efectivo: el cliente le pagó en mano al local.

        Si se agregaron productos a un pedido ya pagado, lo que cuenta es cómo se saldó la diferencia.
        """
        return (self.balance_payment_method or self.payment_method) == PaymentMethod.CASH.value

    @property
    def has_partial_payment(self) -> bool:
        return not self.is_paid and to_money(self.paid_amount or 0) > 0

    def change_payment_method(self, method: PaymentMethod | str) -> None:
        """Cambia cómo se paga el pedido, siempre que no haya salido y todavía haya algo por pagar.

        Con un pago parcial lo que se cambia es cómo se salda la diferencia: lo ya cobrado no se toca.
        """
        method = PaymentMethod(method)
        self._require_modifiable()
        if self.is_paid:
            raise PaymentChangeNotAllowedError("El pedido ya está abonado: no hay nada más por pagar.")
        if self.has_partial_payment:
            self.balance_payment_method = method.value
        else:
            self.payment_method = method.value

    # --- Modificación por el cliente ----------------------------------------------------------------

    @property
    def is_modifiable(self) -> bool:
        """Todavía no salió ni terminó: el cliente puede cambiar el pago o (en la ventana) sumar productos."""
        return OrderStatus(self.status) in _MODIFIABLE_STATUSES

    def _require_modifiable(self) -> None:
        if not self.is_modifiable:
            raise OrderNotModifiableError("El pedido ya no admite cambios.")

    def is_within_modification_window(self, now: datetime | None = None) -> bool:
        created = self.created_at
        if created is None:
            return True
        if created.tzinfo is None:  # la base lo guarda en UTC
            created = created.replace(tzinfo=timezone.utc)
        return (now or datetime.now(timezone.utc)) - created <= MODIFICATION_WINDOW

    def add_items(self, lines: Iterable[tuple], now: datetime | None = None) -> Decimal:
        """Suma productos o promociones a este mismo pedido (un solo ticket de cocina y un solo envío) y devuelve lo que costaron.

        Solo dentro de la ventana de modificación. Si el pedido ya estaba abonado queda con un pago parcial: lo
        pagado hasta ahora y la diferencia por cobrar. Los productos agregados se marcan para que cocina los vea.
        """
        self._require_modifiable()
        if not self.is_within_modification_window(now):
            raise ModificationWindowClosedError()

        parsed_lines: list[tuple[Any, int, Any, str | None, list[dict], Any]] = []
        for line in lines:
            promotion = None
            if len(line) == 2:
                product, quantity = line
                secondary_product, custom_name, mods = None, None, []
            elif len(line) == 4:
                product, quantity, secondary_product, custom_name = line[:4]
                mods = []
            elif len(line) == 5:
                product, quantity, secondary_product, custom_name = line[:4]
                mods = list(line[4]) if line[4] else []
            else:
                product, quantity, secondary_product, custom_name = line[:4]
                mods = list(line[4]) if line[4] else []
                promotion = line[5] if len(line) > 5 else None
            if quantity < 1:
                raise InvalidOrderError("Hay una cantidad inválida en el pedido.")
            parsed_lines.append((product, quantity, secondary_product, custom_name, mods, promotion))

        if not parsed_lines:
            raise InvalidOrderError("No hay productos para agregar.")

        added: dict[tuple, tuple[Any, Any, str | None, Decimal, int, list[dict], Any]] = {}
        for p1, qty, p2, cname, mods, promo in parsed_lines:
            if promo is not None:
                cname = cname or promo.name
                mods_key = json.dumps(mods, sort_keys=True) if mods else ""
                key = ("promo", promo.id, cname, mods_key)
                price = promo.price
            else:
                cname = cname or (format_half_and_half_name(p1.name, p2.name) if p2 else None)
                mods_key = json.dumps(mods, sort_keys=True) if mods else ""
                key = (p1.id, p2.id if p2 else None, cname, mods_key)
                base_price = max(p1.price, p2.price) if p2 else p1.price
                extra_cost = sum(
                    to_money(m.get("price", 0))
                    for m in mods
                    if (m.get("type") in ("positive", "extra", "add") or m.get("action") == "add") and m.get("price")
                )
                price = base_price + extra_cost

            if key in added:
                prev_p1, prev_p2, prev_name, prev_price, prev_qty, prev_mods, prev_promo = added[key]
                added[key] = (prev_p1, prev_p2, prev_name, prev_price, prev_qty + qty, prev_mods, prev_promo)
            else:
                added[key] = (p1, p2, cname, price, qty, mods, promo)

        unavailable = []
        for p1, p2, _, _, _, _, promo in added.values():
            if promo is not None:
                if not promo.is_available:
                    unavailable.append(promo.name)
            else:
                if p1 is not None and not p1.is_available:
                    unavailable.append(p1.name)
                if p2 is not None and not p2.is_available:
                    unavailable.append(p2.name)
        if unavailable:
            raise InvalidOrderError(
                f"Estos productos no están disponibles en este momento: {', '.join(dict.fromkeys(unavailable))}."
            )

        current_quantities: dict[tuple, int] = {}
        for item in self.items:
            mods_key = json.dumps(item.modifications, sort_keys=True) if item.modifications else ""
            if item.promotion_id:
                key = ("promo", item.promotion_id, item.custom_name, mods_key)
            else:
                key = (item.product_id, item.secondary_product_id, item.custom_name, mods_key)
            current_quantities[key] = current_quantities.get(key, 0) + item.quantity

        exceeded = []
        for key, (p1, _p2, cname, _, qty, _, promo) in added.items():
            if current_quantities.get(key, 0) + qty > MAX_QUANTITY_PER_ITEM:
                exceeded.append(cname or (promo.name if promo else (p1.name if p1 else "")))
        if exceeded:
            raise InvalidOrderError(
                f"Superaste la cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: {', '.join(exceeded)}."
            )

        previous_total = to_money(self.total_amount)
        was_paid = bool(self.is_paid)
        new_items = [
            OrderItem(
                product_id=p1.id if p1 else None,
                secondary_product_id=p2.id if p2 else None,
                promotion_id=promo.id if promo else None,
                product=p1,
                secondary_product=p2,
                promotion=promo,
                quantity=qty,
                unit_price=price,
                custom_name=cname,
                modifications=mods,
                added_later=True,
            )
            for p1, p2, cname, price, qty, mods, promo in added.values()
        ]
        self.items.extend(new_items)
        cost = sum((item.subtotal for item in new_items), Decimal(0))
        self.total_amount = previous_total + cost
        if was_paid:
            self.paid_amount = previous_total
            self.is_paid = False
            self.balance_payment_method = None
        self.kitchen_update_pending = True
        return to_money(cost)

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

    @property
    def is_all_prepared(self) -> bool:
        return bool(self.items) and all(item.is_prepared for item in self.items)

    @property
    def items_prepared_count(self) -> int:
        return sum(1 for item in self.items if item.is_prepared)

    @property
    def sectors(self) -> list[str]:
        seen = set()
        res = []
        for item in self.items:
            s = item.sector
            if s not in seen:
                seen.add(s)
                res.append(s)
        return res


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    secondary_product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    promotion_id = Column(Integer, ForeignKey("promotions.id", ondelete="SET NULL"), nullable=True)
    custom_name = Column(String(255), nullable=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(MoneyColumn, nullable=False)
    is_prepared = Column(Boolean, nullable=False, default=False, server_default=false())
    # Se agregó después de registrado el pedido (cocina lo ve resaltado).
    added_later = Column(Boolean, nullable=False, default=False, server_default=false())
    modifications = Column(JSON, nullable=True, default=list)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])
    secondary_product = relationship("Product", foreign_keys=[secondary_product_id])
    promotion = relationship("Promotion", foreign_keys=[promotion_id])

    @validates("unit_price")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)

    @property
    def display_name(self) -> str:
        if self.custom_name:
            return self.custom_name
        if self.promotion:
            return self.promotion.name
        if self.secondary_product and self.product:
            return format_half_and_half_name(self.product.name, self.secondary_product.name)
        return self.product.name if self.product else ""

    @property
    def comanda_display(self) -> str:
        if self.promotion:
            items_str = ", ".join(f"{it.quantity}x {it.product.name}" for it in self.promotion.items if it.product) if self.promotion.items else ""
            return f"PROMO: {self.promotion.name}" + (f" ({items_str})" if items_str else "")
        tags = " ".join(
            m.get("tag") or (f"[SIN {m.get('name', '').upper()}]" if m.get("type") == "negative" or m.get("action") == "remove" else f"[EXTRA {m.get('name', '').upper()}]")
            for m in (self.modifications or [])
        ).strip()
        return f"{self.display_name} {tags}".strip() if tags else self.display_name

    @property
    def subtotal(self) -> Decimal:
        return self.unit_price * self.quantity

    @property
    def sector(self) -> str:
        if self.promotion and self.promotion.items:
            sectors = [it.product.effective_sector for it in self.promotion.items if it.product]
            if "cocina" in sectors:
                return "cocina"
            return sectors[0] if sectors else "cocina"
        if self.product:
            return self.product.effective_sector
        return "cocina"
