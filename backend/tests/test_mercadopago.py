from unittest.mock import MagicMock, patch

import pytest

from app.models.order import DeliveryMethod, Order, PaymentMethod
from app.services.mercadopago_service import create_payment_preference, process_payment_notification


@pytest.fixture
def sample_order(db_session, products):
    order = Order(
        customer_name="Lucas Gómez",
        shipping_address="Av. Corrientes 500",
        total_amount=17000.0,
        status="Pendiente",
        delivery_method=DeliveryMethod.DELIVERY.value,
        telegram_chat_id="12345678",
        payment_method="mercadopago",
        is_paid=False,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def test_create_payment_preference_without_token_generates_sandbox_fallback(sample_order):
    pref = create_payment_preference(sample_order, store_name="RestoIT")
    assert "preference_id" in pref
    assert "init_point" in pref
    assert f"mp-pref-{sample_order.id}" in pref["preference_id"]
    assert "mercadopago.com.ar" in pref["init_point"]


def test_create_payment_preference_with_token(sample_order):
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "id": "pref_real_123",
        "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_real_123",
        "sandbox_init_point": "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_real_123",
    }

    with patch("app.services.mercadopago_service.settings.MERCADOPAGO_ACCESS_TOKEN", "APP_USR-test-token"), \
         patch("httpx.Client.post", return_value=mock_response):
        pref = create_payment_preference(sample_order, store_name="RestoIT")
        assert pref["preference_id"] == "pref_real_123"
        assert pref["init_point"] == "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_real_123"


def test_process_payment_notification_marks_order_as_paid(db_session, sample_order):
    payload = {
        "action": "payment.updated",
        "status": "approved",
        "external_reference": str(sample_order.id),
        "data": {"id": "pay_99999"},
    }

    updated_order = process_payment_notification(db_session, payload=payload)
    assert updated_order is not None
    assert updated_order.id == sample_order.id
    assert updated_order.is_paid is True
    assert updated_order.payment_method == PaymentMethod.MERCADOPAGO.value
    assert updated_order.mp_payment_id == "pay_99999"


def test_process_payment_notification_ignores_rejected_status(db_session, sample_order):
    payload = {
        "action": "payment.updated",
        "status": "rejected",
        "external_reference": str(sample_order.id),
        "data": {"id": "pay_88888"},
    }

    result = process_payment_notification(db_session, payload=payload)
    assert result is None
    db_session.refresh(sample_order)
    assert sample_order.is_paid is False


def test_webhook_endpoint_updates_order_and_triggers_notification(client, db_session, sample_order):
    payload = {
        "action": "payment.updated",
        "status": "approved",
        "external_reference": str(sample_order.id),
        "data": {"id": "pay_11111"},
    }

    with patch("app.api.mercadopago_router.send_telegram_message"):
        response = client.post("/api/v1/mercadopago/webhook", json=payload)
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    db_session.refresh(sample_order)
    assert sample_order.is_paid is True


def test_webhook_notifies_telegram_only_once_for_repeated_notifications(client, sample_order):
    created = {
        "action": "payment.created",
        "status": "approved",
        "external_reference": str(sample_order.id),
        "data": {"id": "pay_22222"},
    }
    updated = {**created, "action": "payment.updated"}

    with patch("app.api.mercadopago_router.send_telegram_message") as send:
        client.post("/api/v1/mercadopago/webhook", json=created)
        client.post("/api/v1/mercadopago/webhook", json=updated)

    assert send.call_count == 1


def test_webhook_get_ping(client):
    response = client.get("/api/v1/mercadopago/webhook")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_manual_mark_order_as_paid(client, db_session, sample_order):
    assert sample_order.is_paid is False
    with patch("app.api.order_router.send_telegram_message"):
        response = client.patch(f"/api/v1/orders/{sample_order.id}/payment", json={"is_paid": True})
        assert response.status_code == 200
        data = response.json()
        assert data["is_paid"] is True

    db_session.refresh(sample_order)
    assert sample_order.is_paid is True

