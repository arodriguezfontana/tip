from datetime import datetime
from typing import Literal

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
    # Canal de mensajería del pedido del bot (telegram, whatsapp); None si no vino de un chat.
    channel: str | None = None
    # El pedido salió de un chat del bot y se puede hablar con el cliente desde el panel.
    has_chat: bool = False
    customer_phone: str | None = None
    notes: str | None = None
    estimated_minutes: int | None
    # De dónde salió la demora: "smart" (historial del local), "manual" (la indicó el personal) o "default".
    estimate_source: str | None = None
    # Demora real en minutos (desde que ingresó hasta que se finalizó); vacía mientras el pedido no terminó.
    actual_minutes: int | None = None
    scheduled_for: datetime | None = None
    created_at: datetime
    item_count: int
    delivery_driver_id: int | None = None
    delivery_driver_name: str | None = None
    # Viaje en el que salió el pedido, su parada y la llegada estimada; vacíos mientras el viaje se está armando.
    trip_id: int | None = None
    trip_stop: int | None = None
    eta_minutes: int | None = None
    payment_method: PaymentMethod | None = None  # type: ignore[assignment]
    is_paid: bool = False
    # Pago parcial (se agregaron productos a un pedido ya abonado): lo cobrado, lo que falta y cómo se salda.
    paid_amount: float = 0
    pending_amount: float = 0
    balance_payment_method: PaymentMethod | None = None  # type: ignore[assignment]
    # Se agregaron productos y cocina todavía no lo vio.
    kitchen_update_pending: bool = False
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
            channel=order.channel,
            has_chat=bool(order.channel and order.chat_id),
            customer_phone=order.customer_phone,
            notes=order.notes,
            estimated_minutes=order.estimated_minutes,
            estimate_source=order.estimate_source,
            actual_minutes=order.actual_minutes,
            scheduled_for=order.scheduled_for,
            created_at=order.created_at,
            item_count=len(order.items),
            delivery_driver_id=order.delivery_driver_id,
            delivery_driver_name=order.delivery_driver.name if order.delivery_driver else None,
            trip_id=order.trip_id,
            trip_stop=order.trip_stop,
            eta_minutes=order.eta_minutes,
            payment_method=order.payment_method,
            is_paid=bool(order.is_paid),
            paid_amount=order.amount_paid,
            pending_amount=order.amount_pending,
            balance_payment_method=order.balance_payment_method,
            kitchen_update_pending=bool(order.kitchen_update_pending),
            items=[WebOrderItemResponse.from_model(item) for item in order.items] if order.items else [],
            items_prepared_count=order.items_prepared_count,
            is_all_prepared=order.is_all_prepared,
            sectors=order.sectors,
        )


class OrderDelayEstimateResponse(BaseModel):
    """Cómo se estimará la demora al aceptar un pedido."""

    # "smart": la calcula el sistema con el historial; "manual": la tiene que indicar el empleado.
    mode: Literal["smart", "manual"]
    # Demora calculada (solo en modo inteligente).
    estimated_minutes: int | None = None
    # Pedidos parecidos con los que se calculó, o los que hay hasta ahora, y los que se necesitan.
    samples: int
    min_samples: int
    queue_size: int
    # Demora estándar del local, para sugerirla al cargarla a mano.
    suggested_minutes: int


class TripDispatchPayload(BaseModel):
    delivery_driver_id: int = Field(..., gt=0)
    # Pedidos que salen en el viaje; si no se indican, salen todos los que el repartidor tiene armados.
    order_ids: list[int] | None = Field(None, min_length=1)


class TripStopResponse(BaseModel):
    order_id: int
    stop: int
    address: str
    customer_name: str
    eta_minutes: int | None = None


class TripResponse(BaseModel):
    id: int
    delivery_driver_id: int | None
    delivery_driver_name: str | None
    dispatched_at: datetime
    total_minutes: int | None = None
    # Por qué el viaje salió sin tiempos estimados (solo si no se pudo calcular la ruta).
    warning: str | None = None
    stops: list[TripStopResponse]

    @classmethod
    def from_model(cls, trip, warning: str | None = None) -> "TripResponse":
        return cls(
            id=trip.id,
            delivery_driver_id=trip.delivery_driver_id,
            delivery_driver_name=trip.driver.name if trip.driver else None,
            dispatched_at=trip.dispatched_at,
            total_minutes=trip.total_minutes,
            warning=warning,
            stops=[
                TripStopResponse(
                    order_id=o.id,
                    stop=o.trip_stop,
                    address=o.shipping_address,
                    customer_name=o.customer_name,
                    eta_minutes=o.eta_minutes,
                )
                for o in trip.orders
            ],
        )


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    estimated_minutes: int | None = Field(None, gt=0)
    delivery_driver_id: int | None = None


class WebOrderItemCreate(BaseModel):
    product_id: int | None = Field(None, gt=0)
    promotion_id: int | None = Field(None, gt=0)
    quantity: int = Field(..., ge=1)
    secondary_product_id: int | None = Field(None, gt=0)
    custom_name: str | None = None
    modifications: list[dict] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_item_source(self) -> "WebOrderItemCreate":
        if self.product_id is None and self.promotion_id is None:
            raise ValueError("Cada ítem debe indicar un producto o una promoción.")
        return self


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
            items=[
                (
                    item.product_id,
                    item.quantity,
                    item.secondary_product_id,
                    item.custom_name,
                    item.modifications,
                    item.promotion_id,
                )
                for item in self.items
            ],
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


class PromotionProductDetail(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    sector: str = "cocina"


class WebOrderItemResponse(BaseModel):
    id: int | None = None
    product_id: int | None = None
    promotion_id: int | None = None
    is_promotion: bool = False
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float
    sector: str = "cocina"
    is_prepared: bool = False
    added_later: bool = False
    secondary_product_id: int | None = None
    modifications: list[dict] = Field(default_factory=list)
    promotion_products: list[PromotionProductDetail] = Field(default_factory=list)
    promotion_description: str | None = None

    @classmethod
    def from_model(cls, item: OrderItem) -> "WebOrderItemResponse":
        promo_products = []
        if item.promotion and item.promotion.items:
            for it in item.promotion.items:
                if it.product:
                    promo_products.append(
                        PromotionProductDetail(
                            product_id=it.product_id,
                            product_name=it.product.name,
                            quantity=it.quantity * item.quantity,
                            sector=it.product.effective_sector,
                        )
                    )
        return cls(
            id=item.id,
            product_id=item.product_id,
            promotion_id=item.promotion_id,
            is_promotion=item.promotion_id is not None,
            product_name=item.display_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.subtotal,
            sector=item.sector,
            is_prepared=bool(item.is_prepared),
            added_later=bool(item.added_later),
            secondary_product_id=item.secondary_product_id,
            modifications=item.modifications or [],
            promotion_products=promo_products,
            promotion_description=item.promotion.description if item.promotion else None,
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
