from unittest.mock import AsyncMock, patch

import pytest

from app.models.order import Order


def _create_order(db_session, status="Pendiente", delivery_method="domicilio", channel="telegram", chat_id="12345"):
    order = Order(
        customer_name="Juan Perez",
        shipping_address="Av. Siempreviva 742",
        total_amount=1000.0,
        status=status,
        delivery_method=delivery_method,
        channel=channel,
        chat_id=chat_id,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


@pytest.fixture()
def mock_send_message():
    with patch(
        "app.services.order_notification_service.enviar_mensaje", new_callable=AsyncMock
    ) as mock:
        yield mock


def test_confirmar_notifica_aceptacion_con_demora(client, db_session, mock_send_message):
    order = _create_order(db_session)

    response = client.patch(
        f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 30}
    )

    assert response.status_code == 200
    mock_send_message.assert_called_once()
    canal, chat_id, mensaje = mock_send_message.call_args[0]
    assert (canal, chat_id) == ("telegram", "12345")
    assert "30" in mensaje


def test_rechazar_notifica_rechazo(client, db_session, mock_send_message):
    order = _create_order(db_session)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    mock_send_message.assert_called_once()
    *_, mensaje = mock_send_message.call_args[0]
    assert "rechazado" in mensaje.lower()


@pytest.mark.parametrize(
    "delivery_method,terminal_status,texto_esperado",
    [("domicilio", "En Camino", "camino"), ("retiro", "Listo para Retirar", "retirar")],
)
def test_despacho_notifica_segun_metodo_entrega(
    client, db_session, mock_send_message, delivery_method, terminal_status, texto_esperado
):
    order = _create_order(db_session, status="Confirmado", delivery_method=delivery_method)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": terminal_status})

    assert response.status_code == 200
    mock_send_message.assert_called_once()
    *_, mensaje = mock_send_message.call_args[0]
    assert texto_esperado in mensaje.lower()


def test_sin_chat_no_notifica(client, db_session, mock_send_message):
    order = _create_order(db_session, channel=None, chat_id=None)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    mock_send_message.assert_not_called()


def test_un_pedido_de_whatsapp_se_notifica_por_whatsapp(client, db_session, mock_send_message):
    order = _create_order(db_session, channel="whatsapp", chat_id="5491155551234")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    canal, chat_id, _ = mock_send_message.call_args[0]
    assert (canal, chat_id) == ("whatsapp", "5491155551234")


def test_cancelar_notifica_al_cliente_por_telegram(client, db_session, mock_send_message):
    order = _create_order(db_session, status="Confirmado")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Cancelado"})

    assert response.status_code == 200
    mock_send_message.assert_called_once()
    canal, chat_id, mensaje = mock_send_message.call_args[0]
    assert (canal, chat_id) == ("telegram", "12345")
    assert f"cancelar tu pedido #{order.id}" in mensaje
    assert "reintegro" not in mensaje


def test_cancelar_un_pedido_abonado_avisa_del_reintegro(client, db_session, mock_send_message):
    order = _create_order(db_session, status="En Camino")
    order.is_paid = True
    db_session.commit()

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Cancelado"})

    *_, mensaje = mock_send_message.call_args[0]
    assert "reintegro" in mensaje


# --- Aviso de cobro registrado desde el panel ---


@pytest.fixture()
def mock_aviso_de_pago():
    with patch("app.api.order_router.enviar_mensaje", new_callable=AsyncMock) as mock:
        yield mock


def _marcar_abonado(client, order):
    return client.patch(f"/api/v1/orders/{order.id}/payment", json={"is_paid": True})


def test_marcar_abonado_un_pedido_en_efectivo_no_avisa_al_cliente(client, db_session, mock_aviso_de_pago):
    order = _create_order(db_session)
    order.payment_method = "efectivo"
    db_session.commit()

    assert _marcar_abonado(client, order).status_code == 200
    mock_aviso_de_pago.assert_not_called()


def test_marcar_abonado_la_diferencia_en_efectivo_tampoco_avisa(client, db_session, mock_aviso_de_pago):
    order = _create_order(db_session)
    order.payment_method = "mercadopago"
    order.balance_payment_method = "efectivo"
    db_session.commit()

    assert _marcar_abonado(client, order).status_code == 200
    mock_aviso_de_pago.assert_not_called()


def test_marcar_abonado_un_pedido_digital_si_avisa_al_cliente(client, db_session, mock_aviso_de_pago):
    order = _create_order(db_session)
    order.payment_method = "mercadopago"
    db_session.commit()

    assert _marcar_abonado(client, order).status_code == 200
    canal, chat_id, mensaje = mock_aviso_de_pago.call_args[0]
    assert (canal, chat_id) == ("telegram", "12345")
    assert "Recibimos el pago" in mensaje


def test_marcar_abonada_la_diferencia_por_mercadopago_si_avisa_aunque_el_pedido_fuera_en_efectivo(
    client, db_session, mock_aviso_de_pago
):
    order = _create_order(db_session)
    order.payment_method = "efectivo"
    order.balance_payment_method = "mercadopago"
    db_session.commit()

    assert _marcar_abonado(client, order).status_code == 200
    mock_aviso_de_pago.assert_called_once()


def test_el_pago_de_la_diferencia_por_mercadopago_se_avisa_al_cliente(client, db_session, mock_aviso_de_pago):
    order = _create_order(db_session, chat_id="5491155551234", channel="whatsapp")
    order.payment_method = "mercadopago"
    order.is_paid = False
    order.paid_amount = 1000
    order.total_amount = 1500
    order.balance_payment_method = "mercadopago"
    db_session.commit()

    with patch("app.api.mercadopago_router.enviar_mensaje", new_callable=AsyncMock) as aviso:
        response = client.post(
            "/api/v1/mercadopago/webhook",
            json={"status": "approved", "external_reference": f"{order.id}-extra", "data": {"id": "777"}},
        )

    assert response.status_code == 200
    canal, chat_id, mensaje = aviso.call_args[0]
    assert (canal, chat_id) == ("whatsapp", "5491155551234")
    assert "pago de la diferencia" in mensaje
