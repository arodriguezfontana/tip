from unittest.mock import MagicMock, patch

import pytest

from app.models.order import DeliveryMethod, Order, PaymentMethod
from app.services.mercadopago_service import (
    _last_checked,
    confirm_payment,
    create_payment_preference,
    find_approved_payment_id,
    process_payment_notification,
    reconcile_pending_payments,
    web_payment_return_url,
)


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


def test_payment_preference_with_return_url_sends_back_urls(sample_order):
    mock_response = MagicMock(status_code=201)
    mock_response.json.return_value = {"id": "pref_web", "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_web"}
    return_url = web_payment_return_url(sample_order)

    with patch("app.services.mercadopago_service.settings.MERCADOPAGO_ACCESS_TOKEN", "APP_USR-test-token"),          patch("httpx.Client.post", return_value=mock_response) as post:
        create_payment_preference(sample_order, return_url=return_url)

    sent = post.call_args.kwargs["json"]
    assert return_url == f"http://localhost:5173/menu?pedido={sample_order.id}"
    assert sent["back_urls"] == {"success": return_url, "pending": return_url, "failure": return_url}
    assert sent["items"][0]["unit_price"] == 17000.0
    assert sent["external_reference"] == str(sample_order.id)
    # MercadoPago no permite la vuelta automática a una URL que no sea https.
    assert "auto_return" not in sent


def test_payment_preference_auto_returns_to_https_sites(sample_order):
    mock_response = MagicMock(status_code=201)
    mock_response.json.return_value = {"id": "pref_web", "init_point": "https://mp/redirect"}

    with patch("app.services.mercadopago_service.settings.MERCADOPAGO_ACCESS_TOKEN", "APP_USR-test-token"),          patch("httpx.Client.post", return_value=mock_response) as post:
        create_payment_preference(sample_order, return_url="https://restoit.com/menu?pedido=1")

    assert post.call_args.kwargs["json"]["auto_return"] == "approved"


def test_confirm_payment_checks_with_mercadopago_and_marks_order_as_paid(db_session, sample_order):
    details = {"status": "approved", "external_reference": str(sample_order.id)}
    with patch("app.services.mercadopago_service.fetch_payment_details", return_value=details) as fetch:
        status = confirm_payment(db_session, "pay_777")

    fetch.assert_called_once_with("pay_777")
    assert status == "approved"
    db_session.refresh(sample_order)
    assert sample_order.is_paid is True
    assert sample_order.mp_payment_id == "pay_777"


def test_confirm_payment_does_not_mark_rejected_payments(db_session, sample_order):
    details = {"status": "rejected", "external_reference": str(sample_order.id)}
    with patch("app.services.mercadopago_service.fetch_payment_details", return_value=details):
        assert confirm_payment(db_session, "pay_778") == "rejected"

    db_session.refresh(sample_order)
    assert sample_order.is_paid is False


def test_confirm_endpoint_returns_status_from_mercadopago(public_client, sample_order):
    details = {"status": "approved", "external_reference": str(sample_order.id)}
    with patch("app.services.mercadopago_service.fetch_payment_details", return_value=details):
        response = public_client.post("/api/v1/mercadopago/confirm", json={"payment_id": "pay_779"})

    assert response.status_code == 200
    assert response.json() == {"status": "approved"}


def test_confirm_endpoint_without_payment_info_returns_null_status(public_client, db_session):
    # Sin credenciales no se puede consultar el pago: no se marca nada.
    response = public_client.post("/api/v1/mercadopago/confirm", json={"payment_id": "pay_780"})

    assert response.status_code == 200
    assert response.json() == {"status": None}


@pytest.fixture
def mp_credentials():
    _last_checked.clear()
    with patch("app.services.mercadopago_service.settings.MERCADOPAGO_ACCESS_TOKEN", "APP_USR-test-token"):
        yield
    _last_checked.clear()


def _with_preference(db_session, order):
    order.mp_preference_id = f"pref-{order.id}"
    db_session.commit()
    return order


def test_reconcile_marks_order_paid_when_mercadopago_has_an_approved_payment(db_session, sample_order, mp_credentials):
    _with_preference(db_session, sample_order)
    with patch("app.services.mercadopago_service.find_approved_payment_id", return_value="184507") as find:
        paid = reconcile_pending_payments(db_session)

    find.assert_called_once_with(sample_order.id)
    assert [o.id for o in paid] == [sample_order.id]
    db_session.refresh(sample_order)
    assert sample_order.is_paid is True
    assert sample_order.mp_payment_id == "184507"


def test_reconcile_leaves_orders_without_an_approved_payment(db_session, sample_order, mp_credentials):
    _with_preference(db_session, sample_order)
    with patch("app.services.mercadopago_service.find_approved_payment_id", return_value=None):
        assert reconcile_pending_payments(db_session) == []

    db_session.refresh(sample_order)
    assert sample_order.is_paid is False


def test_reconcile_does_nothing_without_credentials(db_session, sample_order):
    _with_preference(db_session, sample_order)
    with patch("app.services.mercadopago_service.find_approved_payment_id") as find:
        assert reconcile_pending_payments(db_session) == []

    find.assert_not_called()


def test_reconcile_ignores_paid_cancelled_and_non_mercadopago_orders(db_session, sample_order, mp_credentials):
    _with_preference(db_session, sample_order)
    sample_order.status = "Cancelado"
    db_session.commit()
    with patch("app.services.mercadopago_service.find_approved_payment_id") as find:
        assert reconcile_pending_payments(db_session) == []

    find.assert_not_called()


def test_reconcile_does_not_query_the_same_order_again_too_soon(db_session, sample_order, mp_credentials):
    _with_preference(db_session, sample_order)
    with patch("app.services.mercadopago_service.find_approved_payment_id", return_value=None) as find:
        reconcile_pending_payments(db_session)
        reconcile_pending_payments(db_session)

    assert find.call_count == 1


def test_find_approved_payment_id_picks_the_approved_payment_of_that_order(sample_order, mp_credentials):
    response = MagicMock()
    response.json.return_value = {
        "results": [
            {"id": 1, "status": "rejected", "external_reference": str(sample_order.id)},
            {"id": 2, "status": "approved", "external_reference": "999"},
            {"id": 3, "status": "approved", "external_reference": str(sample_order.id)},
        ]
    }
    with patch("httpx.Client.get", return_value=response) as get:
        assert find_approved_payment_id(sample_order.id) == "3"

    assert get.call_args.kwargs["params"]["external_reference"] == str(sample_order.id)


def test_find_approved_payment_id_returns_none_when_mercadopago_fails(sample_order, mp_credentials):
    with patch("httpx.Client.get", side_effect=RuntimeError("sin conexión")):
        assert find_approved_payment_id(sample_order.id) is None


def test_listing_orders_credits_paid_mercadopago_orders_and_notifies_telegram(client, db_session, sample_order, mp_credentials):
    _with_preference(db_session, sample_order)
    with patch("app.services.mercadopago_service.find_approved_payment_id", return_value="184507"),          patch("app.api.order_router.send_telegram_message") as send:
        response = client.get("/api/v1/orders")

    assert response.status_code == 200
    listed = next(o for o in response.json() if o["id"] == sample_order.id)
    assert listed["is_paid"] is True
    send.assert_called_once()
    assert send.call_args.args[0] == 12345678
    assert "Recibimos tu pago" in send.call_args.args[1]


def test_listing_orders_does_not_notify_twice(client, db_session, sample_order, mp_credentials):
    _with_preference(db_session, sample_order)
    with patch("app.services.mercadopago_service.find_approved_payment_id", return_value="184507"),          patch("app.api.order_router.send_telegram_message") as send:
        client.get("/api/v1/orders")
        _last_checked.clear()
        client.get("/api/v1/orders")

    assert send.call_count == 1


def test_return_url_goes_through_the_public_backend_when_there_is_one(sample_order):
    with patch("app.services.mercadopago_service.settings.PUBLIC_URL", "restoit.ngrok-free.dev"):
        url = web_payment_return_url(sample_order)

    # MercadoPago solo acepta https públicas: el backend redirige a la web, que puede estar en localhost.
    assert url == f"https://restoit.ngrok-free.dev/api/v1/mercadopago/return?pedido={sample_order.id}"


def test_return_url_falls_back_to_the_web_without_a_public_url(sample_order):
    with patch("app.services.mercadopago_service.settings.PUBLIC_URL", "http://localhost:8000"):
        url = web_payment_return_url(sample_order)

    assert url == f"http://localhost:5173/menu?pedido={sample_order.id}"


def test_payment_preference_sends_https_back_urls_and_auto_return(sample_order):
    mock_response = MagicMock(status_code=201)
    mock_response.json.return_value = {"id": "pref_web", "init_point": "https://mp/redirect"}

    with patch("app.services.mercadopago_service.settings.MERCADOPAGO_ACCESS_TOKEN", "APP_USR-test-token"),          patch("app.services.mercadopago_service.settings.PUBLIC_URL", "restoit.ngrok-free.dev"),          patch("httpx.Client.post", return_value=mock_response) as post:
        create_payment_preference(sample_order, return_url=web_payment_return_url(sample_order))

    sent = post.call_args.kwargs["json"]
    expected = f"https://restoit.ngrok-free.dev/api/v1/mercadopago/return?pedido={sample_order.id}"
    assert sent["back_urls"] == {"success": expected, "pending": expected, "failure": expected}
    assert sent["auto_return"] == "approved"
    assert sent["notification_url"] == "https://restoit.ngrok-free.dev/api/v1/mercadopago/webhook"


def test_return_endpoint_redirects_to_the_web_with_the_payment_result(public_client):
    response = public_client.get(
        "/api/v1/mercadopago/return",
        params={"pedido": "7", "payment_id": "99", "status": "approved", "preference_id": "ignorado", "next": "https://evil.com"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("http://localhost:5173/menu?")
    assert "pedido=7" in location and "payment_id=99" in location and "status=approved" in location
    assert "evil.com" not in location and "preference_id" not in location

