"""Servicio de integración con MercadoPago para cobros digitales."""

import logging
import time
from typing import Any

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.order import Order, OrderStatus, PaymentMethod

logger = logging.getLogger(__name__)

MERCADOPAGO_API_URL = "https://api.mercadopago.com"

# Cada cuánto, como mínimo, se vuelve a consultar el pago de un mismo pedido (el tablero consulta seguido).
RECONCILE_MIN_INTERVAL_SECONDS = 8
# Tope de pedidos que se verifican por consulta, para que una demora de MercadoPago no trabe el tablero.
RECONCILE_MAX_ORDERS = 10
_last_checked: dict[int, float] = {}

# Referencia externa del cobro de la diferencia de un pedido ya abonado al que se le agregaron productos.
# Va aparte de la del pedido ("<id>") para que el pago original no cuente como el pago de la diferencia.
BALANCE_REFERENCE_SUFFIX = "-extra"


def _reference(order_id: int, balance: bool = False) -> str:
    return f"{order_id}{BALANCE_REFERENCE_SUFFIX}" if balance else str(order_id)


def payment_received_message(order: Order) -> str:
    """Aviso al cliente de que se acreditó su pago por MercadoPago."""
    que = "el pago de la diferencia" if order.balance_payment_method == PaymentMethod.MERCADOPAGO.value else "tu pago"
    return f"✅ ¡Recibimos {que} por MercadoPago para el pedido #{order.id}! ¡Muchas gracias!"


def public_base_url() -> str | None:
    """URL pública (https) del backend, o None si no hay (por ejemplo en desarrollo sin túnel).

    MercadoPago solo acepta direcciones públicas: ignora las que apuntan a localhost.
    """
    base_url = settings.PUBLIC_URL.strip().rstrip("/")
    if base_url and not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"
    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        return None
    return base_url


def create_payment_preference(
    order: Order, store_name: str = "RestoIT", return_url: str | None = None, balance: bool = False
) -> dict[str, str]:
    """Genera una preferencia de pago en MercadoPago por el monto total exacto del pedido.

    Con `balance` el cobro es solo por lo que falta pagar (la diferencia de un pedido al que se le agregaron
    productos después de abonarlo), no por el total.

    Devuelve un diccionario con 'preference_id' y el link de pago ('init_point').
    Si se indica `return_url`, MercadoPago devuelve ahí al cliente al terminar (pague o no), agregando
    en la URL el resultado (status, payment_id, external_reference).
    Si MERCADOPAGO_ACCESS_TOKEN está configurado, consulta la API oficial de MercadoPago.
    Si no está configurado (modo desarrollo o testing), genera un link válido simulado.
    """
    total = float(order.amount_pending if balance else order.total_amount)
    external_ref = _reference(order.id, balance)
    pref_title = f"{'Diferencia del pedido' if balance else 'Pedido'} #{order.id} - {store_name}"

    if settings.MERCADOPAGO_ACCESS_TOKEN:
        url = f"{MERCADOPAGO_API_URL}/checkout/preferences"
        headers = {
            "Authorization": f"Bearer {settings.MERCADOPAGO_ACCESS_TOKEN.strip()}",
            "Content-Type": "application/json",
        }
        base_url = public_base_url()
        notification_url = f"{base_url}{settings.API_V1_STR}/mercadopago/webhook" if base_url else None

        payload: dict[str, Any] = {
            "items": [
                {
                    "id": external_ref,
                    "title": pref_title,
                    "quantity": 1,
                    "unit_price": total,
                    "currency_id": "ARS",
                }
            ],
            "external_reference": external_ref,
            "payer": {
                "name": order.customer_name,
            },
        }
        if notification_url:
            payload["notification_url"] = notification_url
        if return_url:
            payload["back_urls"] = {"success": return_url, "pending": return_url, "failure": return_url}
            # MercadoPago solo acepta URLs https públicas: con otra descarta las back_urls y en el checkout
            # no aparece "Volver al sitio". La vuelta automática también exige https.
            if return_url.startswith("https://"):
                payload["auto_return"] = "approved"

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(url, json=payload, headers=headers)
                if res.status_code >= 400:
                    logger.error("Error de MercadoPago (%s): %s", res.status_code, res.text)
                res.raise_for_status()
                data = res.json()
                pref_id = data.get("id") or f"mp-{external_ref}"
                init_point = data.get("init_point") or data.get("sandbox_init_point")
                if init_point:
                    return {"preference_id": pref_id, "init_point": init_point}
        except Exception as e:
            logger.error("Error al comunicarse con MercadoPago para pedido #%s: %s", order.id, e)

    # Modo simulado / fallback para testing o entornos sin credenciales reales
    simulated_id = f"mp-pref-{external_ref}"
    return {
        "preference_id": simulated_id,
        "init_point": f"https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id={simulated_id}",
    }


def frontend_menu_url() -> str:
    """Página de pedidos de la web, a la que se lleva al cliente al terminar de pagar."""
    return f"{settings.FRONTEND_URL.strip().rstrip('/')}/menu"


def web_payment_return_url(order: Order) -> str:
    """Dirección a la que MercadoPago devuelve al cliente después del checkout.

    Con URL pública (https) pasa por el backend (`/mercadopago/return`), que lo redirige a la web: así
    MercadoPago la acepta aunque la web corra en localhost. Sin URL pública se usa la de la web directamente.
    """
    base_url = public_base_url()
    if base_url:
        return f"{base_url}{settings.API_V1_STR}/mercadopago/return?pedido={order.id}"
    return f"{frontend_menu_url()}?pedido={order.id}"


def start_web_payment(db: Session, order: Order, store_name: str) -> str:
    """Crea el cobro de MercadoPago de un pedido web y devuelve el link al que se redirige al cliente."""
    pref = create_payment_preference(order, store_name=store_name, return_url=web_payment_return_url(order))
    order.mp_preference_id = pref.get("preference_id")
    db.commit()
    return pref["init_point"]


def fetch_payment_details(payment_id: str) -> dict[str, Any] | None:
    """Consulta la información de un pago en la API de MercadoPago."""
    if not settings.MERCADOPAGO_ACCESS_TOKEN:
        return None

    url = f"{MERCADOPAGO_API_URL}/v1/payments/{payment_id}"
    headers = {"Authorization": f"Bearer {settings.MERCADOPAGO_ACCESS_TOKEN}"}
    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.get(url, headers=headers)
            res.raise_for_status()
            return res.json()
    except Exception as e:
        logger.error("Error al obtener detalle del pago %s de MercadoPago: %s", payment_id, e)
        return None


def process_payment_notification(
    db: Session,
    payload: dict[str, Any] | None = None,
    query_params: dict[str, Any] | None = None,
) -> Order | None:
    """Procesa una notificación recibida por el webhook de MercadoPago.

    Identifica el pedido correspondiente, verifica que el pago haya sido exitoso ('approved')
    y actualiza su estado de pago a 'Abonado' (is_paid = True).
    Devuelve el pedido solo si esta notificación fue la que lo marcó como abonado; las
    notificaciones repetidas de un pago ya registrado devuelven None.
    """
    payload = payload or {}
    query_params = query_params or {}

    # Extraer ID del pago
    payment_id = (
        payload.get("data", {}).get("id")
        or payload.get("id")
        or query_params.get("data.id")
        or query_params.get("id")
    )

    # Estado informado directamente en el payload o parámetros
    status = payload.get("status") or query_params.get("status")
    order_id_raw = (
        payload.get("external_reference")
        or payload.get("order_id")
        or query_params.get("external_reference")
        or query_params.get("order_id")
    )

    # Si hay un payment_id y credenciales, consultar los detalles oficiales
    if payment_id and settings.MERCADOPAGO_ACCESS_TOKEN and (not status or not order_id_raw):
        details = fetch_payment_details(str(payment_id))
        if details:
            status = status or details.get("status")
            order_id_raw = order_id_raw or details.get("external_reference")

    # Si aún no tenemos order_id pero tenemos payment_id, buscar por coincidencia en la BD
    # La diferencia de un pedido ya abonado se cobra con su propia referencia ("<id>-extra").
    is_balance = str(order_id_raw or "").endswith(BALANCE_REFERENCE_SUFFIX)
    order = None
    if order_id_raw:
        try:
            order_id = int(str(order_id_raw).removesuffix(BALANCE_REFERENCE_SUFFIX))
            order = db.query(Order).filter(Order.id == order_id).first()
        except (ValueError, TypeError):
            logger.warning("external_reference / order_id no es un entero: %s", order_id_raw)

    if not order and payment_id:
        order = (
            db.query(Order)
            .filter((Order.mp_preference_id == str(payment_id)) | (Order.mp_payment_id == str(payment_id)))
            .first()
        )

    if not order:
        logger.warning(
            "Webhook de MercadoPago recibido sin orden asociada: payment_id=%s, order_id=%s",
            payment_id,
            order_id_raw,
        )
        return None

    # Considerar exitoso si el estado es approved (o acction created/updated en payloads mock sin status explícito negativo)
    is_approved = (
        status in ("approved", "accredited")
        or (status is None and payload.get("action") in ("payment.created", "payment.updated"))
    )

    if is_approved:
        # MercadoPago suele avisar varias veces el mismo pago (payment.created, payment.updated,
        # IPN + webhook). El UPDATE condicional hace que solo una notificación concrete el cambio,
        # aunque lleguen en simultáneo, y así el cliente recibe un único aviso.
        values: dict[str, Any] = {Order.is_paid: True}
        if not order.payment_method:
            values[Order.payment_method] = PaymentMethod.MERCADOPAGO.value
        if payment_id:
            values[Order.mp_payment_id] = str(payment_id)
        # Un pedido con pago parcial ya cobró su primer pago: solo lo salda el pago de la diferencia, y a la
        # inversa, el aviso (repetido) del primer pago no debe darlo por saldado.
        partial = Order.paid_amount > 0 if is_balance else Order.paid_amount == 0
        if is_balance:
            values.pop(Order.payment_method, None)
        updated = (
            db.query(Order)
            .filter(Order.id == order.id, Order.is_paid.is_(False), partial)
            .update(values, synchronize_session=False)
        )
        db.commit()
        if not updated:
            logger.info("Pedido #%s ya figuraba abonado; se ignora la notificación repetida.", order.id)
            return None
        db.refresh(order)
        logger.info("Pedido #%s marcado como abonado por webhook de MercadoPago.", order.id)
        return order

    logger.info("Webhook de MercadoPago recibido para pedido #%s pero con estado '%s'.", order.id, status)
    return None


def confirm_payment(db: Session, payment_id: str) -> str | None:
    """Confirma un pago consultándolo directamente a MercadoPago (no se confía en lo que diga el cliente).

    Se usa cuando el cliente vuelve del checkout a la web: así el pedido queda abonado en el momento,
    aunque la notificación del webhook todavía no haya llegado (o no pueda llegar, como en desarrollo).
    Devuelve el estado del pago según MercadoPago ('approved', 'pending', 'rejected', ...), o None si
    no se pudo consultar.
    """
    details = fetch_payment_details(payment_id)
    if not details:
        return None
    process_payment_notification(
        db,
        payload={
            "status": details.get("status"),
            "external_reference": details.get("external_reference"),
            "data": {"id": payment_id},
        },
    )
    return details.get("status")


def find_approved_payment_id(order_id: int, balance: bool = False) -> str | None:
    """Id del pago aprobado de un pedido (o de la diferencia, con `balance`), buscándolo en MercadoPago por su
    referencia externa."""
    reference = _reference(order_id, balance)
    if not settings.MERCADOPAGO_ACCESS_TOKEN:
        return None
    try:
        with httpx.Client(timeout=5.0) as client:
            res = client.get(
                f"{MERCADOPAGO_API_URL}/v1/payments/search",
                params={"external_reference": reference, "sort": "date_created", "criteria": "desc"},
                headers={"Authorization": f"Bearer {settings.MERCADOPAGO_ACCESS_TOKEN.strip()}"},
            )
            res.raise_for_status()
            results = res.json().get("results", [])
    except Exception as e:
        logger.warning("No se pudo consultar los pagos del pedido #%s en MercadoPago: %s", order_id, e)
        return None
    for payment in results:
        if payment.get("status") == "approved" and str(payment.get("external_reference")) == reference:
            return str(payment["id"])
    return None


def reconcile_pending_payments(db: Session) -> list[Order]:
    """Acredita los pedidos de MercadoPago que ya se pagaron pero de los que nadie avisó.

    El webhook puede no llegar (túnel caído, servidor sin URL pública) y el cliente puede no volver a la
    web después de pagar. Por eso, a los pedidos de MercadoPago todavía sin abonar se les consulta a
    MercadoPago si ya tienen un pago aprobado. Devuelve los pedidos que esta consulta marcó como abonados.
    """
    if not settings.MERCADOPAGO_ACCESS_TOKEN:
        return []
    active = [s.value for s in (OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.ON_THE_WAY, OrderStatus.READY_FOR_PICKUP)]
    pending = (
        db.query(Order)
        .filter(
            or_(
                Order.payment_method == PaymentMethod.MERCADOPAGO.value,
                Order.balance_payment_method == PaymentMethod.MERCADOPAGO.value,
            ),
            Order.is_paid.is_(False),
            Order.mp_preference_id.isnot(None),
            Order.status.in_(active),
        )
        .order_by(Order.id.desc())
        .limit(RECONCILE_MAX_ORDERS)
        .all()
    )
    now = time.monotonic()
    paid: list[Order] = []
    for order in pending:
        balance = order.has_partial_payment
        if balance and order.balance_payment_method != PaymentMethod.MERCADOPAGO.value:
            continue  # la diferencia se cobra en efectivo: no hay nada que consultarle a MercadoPago
        if now - _last_checked.get(order.id, float("-inf")) < RECONCILE_MIN_INTERVAL_SECONDS:
            continue
        _last_checked[order.id] = now
        payment_id = find_approved_payment_id(order.id, balance=balance) if balance else find_approved_payment_id(order.id)
        if payment_id is None:
            continue
        updated = process_payment_notification(
            db,
            payload={
                "status": "approved",
                "external_reference": _reference(order.id, balance),
                "data": {"id": payment_id},
            },
        )
        if updated is not None:
            paid.append(updated)
    return paid
