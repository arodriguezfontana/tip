from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.order import DeliveryMethod, Order, OrderItem, OrderStatus, PaymentMethod
from app.schemas.common import PHONE_PATTERN
from app.services.order_service import CounterPayment, OrderRequest

MAX_ITEMS_PER_ORDER = 30


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
        )


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    estimated_minutes: int | None = Field(None, gt=0)


class WebOrderItemCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., ge=1)


class WebOrderCreate(BaseModel):
    """Pedido generado desde la web del cliente. Los precios los calcula el backend."""

    model_config = ConfigDict(str_strip_whitespace=True)

    customer_name: str = Field(..., min_length=1, max_length=150)
    customer_phone: str = Field(..., min_length=6, max_length=30, pattern=PHONE_PATTERN)
    delivery_method: DeliveryMethod
    shipping_address: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=500)
    items: list[WebOrderItemCreate] = Field(..., min_length=1, max_length=MAX_ITEMS_PER_ORDER)

    @model_validator(mode="after")
    def _address_required_for_delivery(self) -> "WebOrderCreate":
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


class CounterOrderCreate(WebOrderCreate):
    """Pedido presencial: además de los datos del pedido web, el personal registra el pago."""

    payment_method: PaymentMethod | None = None
    is_paid: bool = False

    def to_payment(self) -> CounterPayment:
        return CounterPayment(
            method=self.payment_method.value if self.payment_method else None, is_paid=self.is_paid
        )


class WebOrderItemResponse(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float

    @classmethod
    def from_model(cls, item: OrderItem) -> "WebOrderItemResponse":
        return cls(
            product_id=item.product_id,
            product_name=item.product.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.subtotal,
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

    @classmethod
    def from_model(cls, order: Order) -> "WebOrderCreatedResponse":
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
        )


class OrderDetailResponse(OrderResponse):
    """Detalle completo de un pedido para el panel: productos, entrega y facturación."""

    items: list[WebOrderItemResponse]
    subtotal: float
    shipping_cost: float
    payment_method: PaymentMethod | None
    is_paid: bool

    @classmethod
    def from_model(cls, order: Order) -> "OrderDetailResponse":
        return cls(
            **OrderResponse.from_model(order).model_dump(),
            items=[WebOrderItemResponse.from_model(item) for item in order.items],
            subtotal=order.subtotal,
            shipping_cost=order.shipping_cost or 0,
            payment_method=order.payment_method,
            is_paid=bool(order.is_paid),
        )
