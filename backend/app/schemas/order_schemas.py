from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.order import DeliveryMethod, Order, OrderItem, OrderStatus, PaymentMethod
from app.schemas.common import PHONE_PATTERN
from app.services.order_service import CounterPayment, OrderRequest

MAX_ITEMS_PER_ORDER = 30
WEB_PAYMENT_METHODS = (PaymentMethod.CASH, PaymentMethod.MERCADOPAGO)


class OrderResponse(BaseModel):
    id: int
    customer_name: str
    shipping_address: str
    total_amount: float
    status: str
    delivery_method: str
    source: str
    customer_phone: str | None = None
    notes: str | None = None
    estimated_minutes: int | None
    scheduled_for: datetime | None = None
    created_at: datetime
    item_count: int
    delivery_driver_id: int | None = None
    delivery_driver_name: str | None = None
    payment_method: PaymentMethod | None = None  # type: ignore[assignment]
    is_paid: bool = False
    items: list["WebOrderItemResponse"] = Field(default_factory=list)
    items_prepared_count: int = 0
    is_all_prepared: bool = False
    sectors: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _web_payment_methods(self) -> "OrderResponse":
        # En el mostrador el personal puede registrar cualquier medio de pago (o ninguno).
        return self

    @classmethod
    def from_model(cls, order: Order) -> "OrderResponse":
        return cls(
            id=order.id,
            customer_name=order.customer_name,
            shipping_address=order.shipping_address,
            total_amount=order.total_amount,
            status=order.status,
            delivery_method=order.delivery_method,
            source=order.source,
            customer_phone=order.customer_phone,
            notes=order.notes,
            estimated_minutes=order.estimated_minutes,
            scheduled_for=order.scheduled_for,
            created_at=order.created_at,
            item_count=len(order.items),
            delivery_driver_id=order.delivery_driver_id,
            delivery_driver_name=order.delivery_driver.name if order.delivery_driver else None,
            payment_method=order.payment_method,
            is_paid=bool(order.is_paid),
            items=[WebOrderItemResponse.from_model(item) for item in order.items] if order.items else [],
            items_prepared_count=order.items_prepared_count,
            is_all_prepared=order.is_all_prepared,
            sectors=order.sectors,
        )


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    estimated_minutes: int | None = Field(None, gt=0)
    delivery_driver_id: int | None = None


class WebOrderItemCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., ge=1)


class _OrderCreate(BaseModel):
    """Datos comunes de un pedido cargado desde la web o el mostrador. Los precios los calcula el backend."""

    model_config = ConfigDict(str_strip_whitespace=True)

    customer_name: str = Field(..., min_length=1, max_length=150)
    customer_phone: str = Field(..., min_length=6, max_length=30, pattern=PHONE_PATTERN)
    delivery_method: DeliveryMethod
    shipping_address: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=500)
    items: list[WebOrderItemCreate] = Field(..., min_length=1, max_length=MAX_ITEMS_PER_ORDER)

    @model_validator(mode="after")
    def _address_required_for_delivery(self) -> "_OrderCreate":
        if self.delivery_method == DeliveryMethod.DELIVERY and not self.shipping_address:
            raise ValueError("La dirección es obligatoria para envíos a domicilio.")
        return self

    def to_request(self) -> OrderRequest:
        return OrderRequest(
            customer_name=self.customer_name,
            customer_phone=self.customer_phone,
            delivery_method=self.delivery_method,
            shipping_address=self.shipping_address,
            notes=self.notes,
            items=[(item.product_id, item.quantity) for item in self.items],
        )


class WebOrderCreate(_OrderCreate):
    """Pedido generado desde la web del cliente.

    Solo se ofrece efectivo (al recibir o retirar) o MercadoPago (se paga online al confirmar). Si el pago
    ya se hizo lo decide el sistema, nunca el cliente: un pedido web siempre arranca sin abonar.
    """

    payment_method: PaymentMethod = PaymentMethod.CASH

    @model_validator(mode="after")
    def _web_payment_methods(self) -> "WebOrderCreate":
        if self.payment_method not in WEB_PAYMENT_METHODS:
            raise ValueError("En la web se puede pagar solo en efectivo o con MercadoPago.")
        return self


class CounterOrderCreate(_OrderCreate):
    """Pedido presencial: además de los datos del pedido, el personal registra el pago."""

    payment_method: PaymentMethod | None = None
    is_paid: bool = False

    def to_payment(self) -> CounterPayment:
        return CounterPayment(
            method=self.payment_method.value if self.payment_method else None, is_paid=self.is_paid
        )


class WebOrderItemResponse(BaseModel):
    id: int | None = None
    product_id: int
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float
    sector: str = "cocina"
    is_prepared: bool = False

    @classmethod
    def from_model(cls, item: OrderItem) -> "WebOrderItemResponse":
        return cls(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name if item.product else "",
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.subtotal,
            sector=item.sector,
            is_prepared=bool(item.is_prepared),
        )


class WebOrderCreatedResponse(BaseModel):
    id: int
    status: str
    customer_name: str
    customer_phone: str | None
    delivery_method: str
    shipping_address: str
    notes: str | None
    total_amount: float
    created_at: datetime
    items: list[WebOrderItemResponse]
    payment_method: str | None = None
    is_paid: bool = False
    # Link de Checkout Pro de MercadoPago al que se redirige al cliente para pagar (solo si eligió MercadoPago).
    payment_url: str | None = None

    @classmethod
    def from_model(cls, order: Order, payment_url: str | None = None) -> "WebOrderCreatedResponse":
        return cls(
            id=order.id,
            status=order.status,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
            delivery_method=order.delivery_method,
            shipping_address=order.shipping_address,
            notes=order.notes,
            total_amount=order.total_amount,
            created_at=order.created_at,
            items=[WebOrderItemResponse.from_model(item) for item in order.items],
            payment_method=order.payment_method,
            is_paid=bool(order.is_paid),
            payment_url=payment_url,
        )


class OrderDetailResponse(OrderResponse):
    """Detalle completo de un pedido para el panel: productos, entrega y facturación."""

    subtotal: float
    shipping_cost: float

    @classmethod
    def from_model(cls, order: Order) -> "OrderDetailResponse":
        return cls(
            **OrderResponse.from_model(order).model_dump(),
            subtotal=order.subtotal,
            shipping_cost=order.shipping_cost or 0,
        )


class OrderPaymentUpdate(BaseModel):
    """Payload para actualizar manualmente el estado de cobro de un pedido."""

    is_paid: bool = True


class OrderItemPreparedUpdate(BaseModel):
    """Payload para marcar un ítem individual como preparado."""

    is_prepared: bool = True


class OrderSectorPreparedUpdate(BaseModel):
    """Payload para marcar todos los ítems de un sector como preparados."""

    is_prepared: bool = True
