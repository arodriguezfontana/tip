import json
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar, cast

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    event,
    false,
    insert,
    inspect,
    select,
)
from sqlalchemy import column as sa_column
from sqlalchemy import table as sa_table
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, Session, mapped_column, object_session, relationship, validates
from sqlalchemy.sql import func

from app.core.channels import Channel
from app.core.errors import BusinessRuleError, ConflictError
from app.core.money import MoneyColumn, to_money
from app.core.phone import normalize_phone
from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.cash_shift import CashShift
    from app.models.delivery_driver import DeliveryDriver, DeliveryTrip
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


class EstimateSource(_StrEnum):
    # Promedio de pedidos parecidos ya entregados (modo inteligente).
    SMART = "smart"
    # La indicó el personal al aceptar el pedido.
    MANUAL = "manual"
    # Demora estándar del local, cuando no hay quien la indique (pedidos que entran ya aceptados).
    DEFAULT = "default"


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


# Tipos de modificación que suman al precio unitario (los que quitan algo no cobran ni descuentan).
_PRICED_MODIFICATION_TYPES = ("positive", "extra", "add")


def modifications_extra_cost(modifications: list[dict]) -> Decimal:
    """Lo que suman al precio unitario las modificaciones que agregan algo."""
    return sum(
        (
            to_money(m.get("price", 0))
            for m in modifications
            if (m.get("type") in _PRICED_MODIFICATION_TYPES or m.get("action") == "add") and m.get("price")
        ),
        Decimal(0),
    )


def complete_line(line: tuple) -> tuple:
    """(producto, cantidad, segundo producto, nombre propio, modificaciones, promoción) con None en lo que falte.

    Las líneas de un pedido pueden traer solo (producto, cantidad) o todos sus datos.
    """
    product, quantity, secondary_product, custom_name, modifications, promotion = (*line, None, None, None, None)[:6]
    return product, quantity, secondary_product, custom_name, list(modifications) if modifications else [], promotion


def _line_key(
    product_id: int | None,
    secondary_product_id: int | None,
    promotion_id: int | None,
    custom_name: str | None,
    modifications: list[dict] | None,
) -> tuple:
    """Identifica a las líneas iguales de un pedido: se suman en vez de repetirse."""
    modifications_key = json.dumps(modifications, sort_keys=True) if modifications else ""
    if promotion_id:
        return ("promo", promotion_id, custom_name, modifications_key)
    return (product_id, secondary_product_id, custom_name, modifications_key)


@dataclass
class _OrderLine:
    """Producto, combinación de dos gustos o promoción que se pide, con su precio unitario actual."""

    product: Any
    secondary_product: Any
    promotion: Any
    custom_name: str | None
    modifications: list[dict]
    quantity: int
    unit_price: Decimal

    @classmethod
    def from_tuple(cls, line: tuple) -> "_OrderLine":
        """Arma la línea desde (producto, cantidad[, segundo producto, nombre propio, modificaciones, promoción])."""
        product, quantity, secondary_product, custom_name, modifications, promotion = complete_line(line)
        if quantity < 1:
            raise InvalidOrderError("Hay una cantidad inválida en el pedido.")
        if promotion is not None:
            custom_name = custom_name or promotion.name
            return cls(product, secondary_product, promotion, custom_name, modifications, quantity, promotion.price)
        if secondary_product:
            custom_name = custom_name or format_half_and_half_name(product.name, secondary_product.name)
            base_price = max(product.price, secondary_product.price)
        else:
            base_price = product.price
        unit_price = base_price + modifications_extra_cost(modifications)
        return cls(product, secondary_product, None, custom_name, modifications, quantity, unit_price)

    @property
    def key(self) -> tuple:
        return _line_key(
            self.product.id if self.product else None,
            self.secondary_product.id if self.secondary_product else None,
            self.promotion.id if self.promotion else None,
            self.custom_name,
            self.modifications,
        )

    @property
    def label(self) -> str:
        if self.custom_name:
            return self.custom_name
        if self.promotion:
            return self.promotion.name
        return self.product.name if self.product else ""

    def unavailable_names(self) -> list[str]:
        if self.promotion is not None:
            return [] if self.promotion.is_available else [self.promotion.name]
        products = (self.product, self.secondary_product)
        return [p.name for p in products if p is not None and not p.is_available]

    def to_order_item(self, added_later: bool = False) -> "OrderItem":
        return OrderItem(
            product_id=self.product.id if self.product else None,
            secondary_product_id=self.secondary_product.id if self.secondary_product else None,
            promotion_id=self.promotion.id if self.promotion else None,
            product=self.product,
            secondary_product=self.secondary_product,
            promotion=self.promotion,
            quantity=self.quantity,
            unit_price=self.unit_price,
            custom_name=self.custom_name,
            modifications=self.modifications,
            added_later=added_later,
        )


def _add_line(consolidated: dict[tuple, _OrderLine], line: _OrderLine) -> None:
    """Suma la línea a otra igual que ya esté, o la agrega."""
    existing = consolidated.get(line.key)
    if existing is None:
        consolidated[line.key] = line
    else:
        existing.quantity += line.quantity


def _consolidate_lines(lines: Iterable[tuple], empty_message: str) -> dict[tuple, _OrderLine]:
    """Las líneas pedidas, con las iguales sumadas. Falla si no hay ninguna o alguna tiene una cantidad inválida."""
    consolidated: dict[tuple, _OrderLine] = {}
    for line in map(_OrderLine.from_tuple, lines):
        _add_line(consolidated, line)
    if not consolidated:
        raise InvalidOrderError(empty_message)
    return consolidated


def _require_available(lines: Iterable[_OrderLine]) -> None:
    unavailable = [name for line in lines for name in line.unavailable_names()]
    if unavailable:
        raise InvalidOrderError(
            f"Estos productos no están disponibles en este momento: {', '.join(dict.fromkeys(unavailable))}."
        )


def _require_within_max_quantity(lines: dict[tuple, _OrderLine], already_ordered: Counter) -> None:
    exceeded = [
        line.label for key, line in lines.items() if already_ordered[key] + line.quantity > MAX_QUANTITY_PER_ITEM
    ]
    if exceeded:
        raise InvalidOrderError(
            f"Superaste la cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: {', '.join(exceeded)}."
        )


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(f"status IN {_values(OrderStatus)}", name="ck_orders_status"),
        CheckConstraint(f"delivery_method IN {_values(DeliveryMethod)}", name="ck_orders_delivery_method"),
        CheckConstraint(f"source IN {_values(OrderSource)}", name="ck_orders_source"),
        CheckConstraint(f"channel IN {_values(Channel)}", name="ck_orders_channel"),
        CheckConstraint(f"balance_payment_method IN {_values(PaymentMethod)}", name="ck_orders_balance_payment_method"),
        CheckConstraint(f"payment_method IN {_values(PaymentMethod)}", name="ck_orders_payment_method"),
        CheckConstraint(f"estimate_source IN {_values(EstimateSource)}", name="ck_orders_estimate_source"),
        UniqueConstraint("numbering_shift_id", "shift_number", name="uq_orders_numbering_shift_id_shift_number"),
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Turno de caja al que pertenece la numeración del pedido (0 si todavía no hubo ningún turno) y su número dentro de
    # él: es el "#N" que ven el personal y el cliente, y arranca de nuevo en 1 con cada turno que se abre. Un pedido que
    # entra con la caja cerrada sigue la numeración del último turno. El `id` sigue siendo la clave interna.
    numbering_shift_id: Mapped[int] = mapped_column(Integer, nullable=False)
    shift_number: Mapped[int] = mapped_column(Integer, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    shipping_address: Mapped[str] = mapped_column(String(255), nullable=False)
    # Total a pagar: suma de los productos más el costo de envío.
    total_amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    shipping_cost: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False, default=0, server_default="0")
    # Sin informar (None) en los pedidos del bot y de la web, que se cobran al entregar.
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    # Parte del total ya cobrada cuando el pedido no está abonado del todo: pasa al agregarle productos a un
    # pedido que ya se había pagado. Con el pedido abonado (is_paid) se paga el total y este campo no se usa.
    paid_amount: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False, default=0, server_default="0")
    # Cómo se salda la diferencia de un pago parcial (efectivo al recibir o link de MercadoPago).
    balance_payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Se agregaron productos y cocina todavía no lo vio (alerta en el tablero de comandas).
    kitchen_update_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=OrderStatus.PENDING.value)
    delivery_method: Mapped[str] = mapped_column(String(20), nullable=False, server_default=DeliveryMethod.DELIVERY.value)
    # Pedidos del bot: canal por el que habló el cliente y su chat en ese canal (para avisarle novedades).
    channel: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chat_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    customer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    delivery_driver_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("delivery_drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cash_shift_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("cash_shifts.id", ondelete="SET NULL"), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default=OrderSource.BOT.value, server_default=OrderSource.BOT.value)
    customer_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # De dónde salió la demora estimada: del historial del local, la cargó el personal o es la estándar.
    estimate_source: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Viaje en el que salió el pedido (None mientras el viaje se está armando), su parada y la llegada estimada.
    trip_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("delivery_trips.id", ondelete="SET NULL"), nullable=True, index=True)
    trip_stop: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eta_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Demora real: minutos desde que el pedido ingresó al sistema hasta que se finalizó. Se guarda al finalizarlo y es
    # la medida con la que se calcula la demora automática (ver delivery_time_service).
    actual_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mp_preference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mp_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    delivery_driver: Mapped["DeliveryDriver | None"] = relationship("DeliveryDriver", back_populates="orders")
    trip: Mapped["DeliveryTrip | None"] = relationship("DeliveryTrip", back_populates="orders")
    cash_shift: Mapped["CashShift | None"] = relationship("CashShift", back_populates="orders", foreign_keys=[cash_shift_id])
    status_events: Mapped[list["OrderStatusEvent"]] = relationship(
        "OrderStatusEvent", back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )

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
        self.shipping_address = PICKUP_ADDRESS if method == DeliveryMethod.PICKUP else (address or "").strip()

    # --- Productos y total --------------------------------------------------------------------------

    def set_items(self, lines: Iterable[tuple]) -> None:
        """Arma los ítems con los precios actuales del menú y recalcula el total.

        Valida las reglas comunes a todos los canales: que haya productos o promociones, que estén disponibles y que no
        se supere el máximo de unidades por producto. Las líneas de un mismo producto o promoción se suman.
        """
        consolidated = _consolidate_lines(lines, "El pedido no tiene productos.")
        _require_available(consolidated.values())
        _require_within_max_quantity(consolidated, Counter())
        self.items = [line.to_order_item() for line in consolidated.values()]
        self.total_amount = self.subtotal + (self.shipping_cost or Decimal(0))

    def _ordered_quantities(self) -> Counter:
        """Unidades que ya tiene el pedido de cada línea (ver _line_key)."""
        ordered: Counter = Counter()
        for item in self.items:
            key = _line_key(
                item.product_id, item.secondary_product_id, item.promotion_id, item.custom_name, item.modifications
            )
            ordered[key] += item.quantity
        return ordered

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

    @property
    def pending_payment_method(self) -> str | None:
        """Con qué se cobra lo que falta (el pedido entero o, con un pago parcial, la diferencia)."""
        if self.is_paid:
            return None
        return self.balance_payment_method if self.has_partial_payment else self.payment_method

    @property
    def awaits_mercadopago_payment(self) -> bool:
        return self.pending_payment_method == PaymentMethod.MERCADOPAGO.value

    @property
    def awaits_cash_payment(self) -> bool:
        return self.pending_payment_method == PaymentMethod.CASH.value

    @property
    def collected_payments(self) -> list[tuple[str | None, Decimal]]:
        """Lo cobrado hasta ahora por medio de pago: si se agregaron productos, la diferencia va por el suyo."""
        total = to_money(self.total_amount)
        first_payment = to_money(self.paid_amount or 0)
        if not self.is_paid:
            return [(self.payment_method, first_payment)] if first_payment > 0 else []
        if first_payment > 0:
            balance_method = self.balance_payment_method or self.payment_method
            return [(self.payment_method, first_payment), (balance_method, total - first_payment)]
        return [(self.payment_method, total)]

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
    def is_dispatched(self) -> bool:
        """El pedido salió de viaje: su repartidor ya recorre la ruta (si no, el viaje todavía se está armando)."""
        return self.trip_id is not None

    @property
    def is_shift_closed(self) -> bool:
        """Indica si el turno de caja al que pertenece este pedido ya fue cerrado (sellado)."""
        return bool(self.cash_shift and not self.cash_shift.is_open)

    @property
    def is_modifiable(self) -> bool:
        """Todavía no salió ni terminó: el cliente puede cambiar el pago o (en la ventana) sumar productos."""
        return OrderStatus(self.status) in _MODIFIABLE_STATUSES

    def _require_modifiable(self) -> None:
        if self.is_shift_closed:
            raise BusinessRuleError("El turno de caja de este pedido ya está cerrado.")
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

        added = _consolidate_lines(lines, "No hay productos para agregar.")
        _require_available(added.values())
        _require_within_max_quantity(added, self._ordered_quantities())

        previous_total = to_money(self.total_amount)
        was_paid = bool(self.is_paid)
        new_items = [line.to_order_item(added_later=True) for line in added.values()]
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
        self,
        new_status: OrderStatus | str,
        estimated_minutes: int | None,
        current_delay_minutes: int,
        estimate_source: "EstimateSource | None" = None,
    ) -> None:
        """Avanza el pedido en su ciclo de vida.

        Al confirmar un pedido para ahora se registra la demora estimada: la indicada o, si no se indica,
        la demora actual del local. Los pedidos programados se entregan en su horario y no llevan demora.
        """
        new_status = OrderStatus(new_status)
        # Un pedido que quedó abierto al cerrar la caja se puede seguir entregando (el reparto no toca el dinero del
        # turno), pero no cancelarlo ni rechazarlo: eso lo sacaría de las ventas de un turno que ya está sellado.
        if self.is_shift_closed and new_status in _NOT_BILLABLE_STATUSES:
            raise BusinessRuleError("El turno de caja de este pedido ya está cerrado.")

        if not self.can_transition_to(new_status):
            raise InvalidTransitionError(self.status, new_status.value)

        is_scheduled = self.scheduled_for is not None
        if is_scheduled and estimated_minutes is not None:
            raise ScheduledOrderEstimateError()
        if not is_scheduled and new_status == OrderStatus.CONFIRMED and estimated_minutes is None:
            estimated_minutes = current_delay_minutes
            estimate_source = EstimateSource.DEFAULT

        self.status = new_status.value
        if new_status == OrderStatus.COMPLETED:
            self.actual_minutes = self._minutes_since_created()
        if estimated_minutes is not None:
            self.estimated_minutes = estimated_minutes
            self.estimate_source = (estimate_source or EstimateSource.MANUAL).value

    def _minutes_since_created(self) -> int | None:
        """Minutos que pasaron desde que el pedido ingresó al sistema (None si todavía no se guardó)."""
        if self.created_at is None:
            return None
        created = self.created_at if self.created_at.tzinfo else self.created_at.replace(tzinfo=timezone.utc)
        return max(0, round((datetime.now(timezone.utc) - created).total_seconds() / 60))

    @property
    def is_all_prepared(self) -> bool:
        return bool(self.items) and all(item.is_prepared for item in self.items)

    @property
    def items_prepared_count(self) -> int:
        return sum(1 for item in self.items if item.is_prepared)

    @property
    def sectors(self) -> list[str]:
        """Sectores que intervienen en el pedido, sin repetir y en orden de aparición."""
        return list(dict.fromkeys(sector for item in self.items for sector in item.all_sectors))


def _modification_tag(modification: dict) -> str:
    """La etiqueta con la que la comanda resalta una modificación (ej. "[SIN CEBOLLA]", "[EXTRA QUESO]")."""
    if modification.get("tag"):
        return modification["tag"]
    name = modification.get("name", "").upper()
    is_removal = modification.get("type") == "negative" or modification.get("action") == "remove"
    return f"[SIN {name}]" if is_removal else f"[EXTRA {name}]"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("products.id"), nullable=True)
    secondary_product_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    promotion_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("promotions.id", ondelete="SET NULL"), nullable=True)
    custom_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    is_prepared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    # Se agregó después de registrado el pedido (cocina lo ve resaltado).
    added_later: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    modifications: Mapped[Any | None] = mapped_column(JSON, nullable=True, default=list)

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    product: Mapped["Product | None"] = relationship("Product", foreign_keys=[product_id])
    secondary_product: Mapped["Product | None"] = relationship("Product", foreign_keys=[secondary_product_id])
    promotion: Mapped["Promotion | None"] = relationship("Promotion", foreign_keys=[promotion_id])

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
        """El ítem como se imprime en la comanda: la promo con sus productos, o el producto con sus modificaciones."""
        if self.promotion:
            return self._promotion_comanda_text(self.promotion)
        tags = " ".join(_modification_tag(modification) for modification in (self.modifications or []))
        return f"{self.display_name} {tags}".strip()

    @staticmethod
    def _promotion_comanda_text(promotion: "Promotion") -> str:
        included = ", ".join(f"{it.quantity}x {it.product.name}" for it in promotion.items if it.product)
        return f"PROMO: {promotion.name}" + (f" ({included})" if included else "")

    @property
    def subtotal(self) -> Decimal:
        return self.unit_price * self.quantity

    @property
    def all_sectors(self) -> list[str]:
        if self.promotion and self.promotion.items:
            return list(dict.fromkeys(self._promotion_sectors())) or ["cocina"]
        return [self.sector]

    @property
    def sector(self) -> str:
        if self.promotion and self.promotion.items:
            sectors = self._promotion_sectors()
            return "cocina" if "cocina" in sectors or not sectors else sectors[0]
        return self.product.effective_sector if self.product else "cocina"

    def _promotion_sectors(self) -> list[str]:
        return [it.product.effective_sector for it in (self.promotion.items if self.promotion else []) if it.product]


class OrderStatusEvent(Base):
    """Cada cambio de estado de un pedido, con el momento exacto y cuántos pedidos había en cola (aceptados y
    todavía sin despachar). Es el historial real del local con el que se estiman las demoras (ver
    delivery_time_service)."""

    __tablename__ = "order_status_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    # Otros pedidos en cola (estado Confirmado) en el momento del cambio, sin contar a este.
    queue_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    order: Mapped["Order"] = relationship("Order", back_populates="status_events")


def _record_status_event(connection, order: "Order") -> None:
    queue_size = connection.execute(
        select(func.count())
        .select_from(Order.__table__)
        .where(Order.__table__.c.status == OrderStatus.CONFIRMED.value, Order.__table__.c.id != order.id)
    ).scalar()
    connection.execute(
        insert(cast(Table, OrderStatusEvent.__table__)).values(
            order_id=order.id,
            status=order.status,
            occurred_at=datetime.now(timezone.utc),
            queue_size=queue_size or 0,
        )
    )


_SHIFT_NUMBERS_KEY = "order_shift_numbers"
_cash_shifts = sa_table("cash_shifts", sa_column("id"))


@event.listens_for(Session, "after_flush_postexec")
def _forget_assigned_shift_numbers(session, _flush_context) -> None:
    session.info.pop(_SHIFT_NUMBERS_KEY, None)


@event.listens_for(Order, "before_insert")
def _assign_shift_number(_mapper, connection, order: "Order") -> None:
    """Numera el pedido dentro de su turno de caja: el siguiente al mayor número ya usado en el turno (1 si es el primero)."""
    if order.numbering_shift_id is None:
        order.numbering_shift_id = order.cash_shift_id or connection.execute(
            select(func.max(_cash_shifts.c.id))
        ).scalar() or 0
    if order.shift_number is None:
        table = Order.__table__
        last = connection.execute(
            select(func.max(table.c.shift_number)).where(table.c.numbering_shift_id == order.numbering_shift_id)
        ).scalar()
        # Varios pedidos que se guardan en un mismo flush todavía no están en la base: se cuentan aparte.
        session = object_session(order)
        assigned = session.info.setdefault(_SHIFT_NUMBERS_KEY, {}) if session is not None else {}
        number = max(last or 0, assigned.get(order.numbering_shift_id, 0)) + 1
        assigned[order.numbering_shift_id] = number
        order.shift_number = number


@event.listens_for(Order, "after_insert")
def _record_initial_status(_mapper, connection, order: "Order") -> None:
    _record_status_event(connection, order)


@event.listens_for(Order, "after_update")
def _record_status_change(_mapper, connection, order: "Order") -> None:
    # Cualquier cambio de estado queda registrado, sin importar desde dónde se haga.
    if inspect(order).attrs.status.history.has_changes():
        _record_status_event(connection, order)
