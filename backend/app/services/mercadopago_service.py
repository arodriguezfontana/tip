"""Servicio de integración con MercadoPago para cobros digitales."""

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.order import Order, PaymentMethod

logger = logging.getLogger(__name__)

MERCADOPAGO_API_URL = "https://api.mercadopago.com"


def create_payment_preference(order: Order, store_name: str = "RestoIT") -> dict[str, str]:
    """Genera una preferencia de pago en MercadoPago por el monto total exacto del pedido.

    Devuelve un diccionario con 'preference_id' y el link de pago ('init_point').
    Si MERCADOPAGO_ACCESS_TOKEN está configurado, consulta la API oficial de MercadoPago.
    Si no está configurado (modo desarrollo o testing), genera un link válido simulado.
    """
    total = float(order.total_amount)
    external_ref = str(order.id)
    pref_title = f"Pedido #{order.id} - {store_name}"

    if settings.MERCADOPAGO_ACCESS_TOKEN:
        url = f"{MERCADOPAGO_API_URL}/checkout/preferences"
        headers = {
            "Authorization": f"Bearer {settings.MERCADOPAGO_ACCESS_TOKEN.strip()}",
            "Content-Type": "application/json",
        }
        base_url = settings.PUBLIC_URL.strip().rstrip("/")
        if base_url and not base_url.startswith(("http://", "https://")):
            base_url = f"https://{base_url}"
        notification_url = None
        if base_url and "localhost" not in base_url and "127.0.0.1" not in base_url:
            notification_url = f"{base_url}{settings.API_V1_STR}/mercadopago/webhook"

        payload: dict[str, Any] = {
            "items": [
                {
                    "id": str(order.id),
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

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(url, json=payload, headers=headers)
                if res.status_code >= 400:
                    logger.error("Error de MercadoPago (%s): %s", res.status_code, res.text)
                res.raise_for_status()
                data = res.json()
                pref_id = data.get("id") or f"mp-{order.id}"
                init_point = data.get("init_point") or data.get("sandbox_init_point")
                if init_point:
                    return {"preference_id": pref_id, "init_point": init_point}
        except Exception as e:
            logger.error("Error al comunicarse con MercadoPago para pedido #%s: %s", order.id, e)

    # Modo simulado / fallback para testing o entornos sin credenciales reales
    simulated_id = f"mp-pref-{order.id}"
    return {
        "preference_id": simulated_id,
        "init_point": f"https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id={simulated_id}",
    }


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
    order = None
    if order_id_raw:
        try:
            order_id = int(order_id_raw)
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
        order.is_paid = True
        if not order.payment_method:
            order.payment_method = PaymentMethod.MERCADOPAGO.value
        if payment_id:
            order.mp_payment_id = str(payment_id)
        db.commit()
        db.refresh(order)
        logger.info("Pedido #%s marcado como abonado por webhook de MercadoPago.", order.id)
        return order

    logger.info("Webhook de MercadoPago recibido para pedido #%s pero con estado '%s'.", order.id, status)
    return None

