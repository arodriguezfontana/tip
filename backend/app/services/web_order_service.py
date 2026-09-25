"""Lógica de negocio para registrar los pedidos generados desde la web del cliente."""

from sqlalchemy.orm import Session

from app.modules.menu import Product
from app.modules.order import Order, OrderItem
from app.modules.user import User
from app.schemas.order_schemas import MAX_QUANTITY_PER_ITEM, WebOrderCreate

PICKUP_ADDRESS = "Retiro en el local"


class InvalidOrderError(Exception):
    """El pedido no puede registrarse porque sus datos no son válidos contra el menú actual."""


def _merge_quantities(payload: WebOrderCreate) -> dict[int, int]:
    """Agrupa las líneas repetidas de un mismo producto sumando sus cantidades."""
    quantities: dict[int, int] = {}
    for item in payload.items:
        quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity
    return quantities


def create_web_order(db: Session, payload: WebOrderCreate, customer: User | None = None) -> Order:
    quantities = _merge_quantities(payload)

    products = db.query(Product).filter(Product.id.in_(quantities.keys())).all()
    products_by_id = {product.id: product for product in products}

    missing_ids = [product_id for product_id in quantities if product_id not in products_by_id]
    if missing_ids:
        raise InvalidOrderError(
            "Algunos productos del pedido no existen en el menú. Actualizá la página e intentá nuevamente."
        )

    unavailable = [products_by_id[product_id].name for product_id in quantities if not products_by_id[product_id].is_active]
    if unavailable:
        raise InvalidOrderError(
            f"Estos productos no están disponibles en este momento: {', '.join(unavailable)}. "
            "Quitalos del carrito para continuar."
        )

    exceeded = [products_by_id[product_id].name for product_id, qty in quantities.items() if qty > MAX_QUANTITY_PER_ITEM]
    if exceeded:
        raise InvalidOrderError(
            f"Superaste la cantidad máxima ({MAX_QUANTITY_PER_ITEM} unidades) para: {', '.join(exceeded)}."
        )

    is_pickup = payload.delivery_method == "retiro"
    order = Order(
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        shipping_address=PICKUP_ADDRESS if is_pickup else payload.shipping_address,
        notes=payload.notes or None,
        delivery_method=payload.delivery_method,
        status="Pendiente",
        source="web",
        customer_id=customer.id if customer is not None else None,
        total_amount=sum(products_by_id[product_id].price * qty for product_id, qty in quantities.items()),
    )
    order.items = [
        OrderItem(product_id=product_id, quantity=qty, unit_price=products_by_id[product_id].price)
        for product_id, qty in quantities.items()
    ]

    db.add(order)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(order)
    return order
