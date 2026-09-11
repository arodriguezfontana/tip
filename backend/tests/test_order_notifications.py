from unittest.mock import AsyncMock, patch

import pytest

from app.modules.order import Order


def _create_order(db_session, status="Pendiente", delivery_method="domicilio", telegram_chat_id="12345"):
    order = Order(
        customer_name="Juan Perez",
        shipping_address="Av. Siempreviva 742",
        total_amount=1000.0,
        status=status,
        delivery_method=delivery_method,
        telegram_chat_id=telegram_chat_id,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


@pytest.fixture()
def mock_send_message():
    with patch(
        "app.services.order_notification_service.send_telegram_message", new_callable=AsyncMock
    ) as mock:
        yield mock


def test_confirmar_notifica_aceptacion_con_demora(client, db_session, mock_send_message):
    order = _create_order(db_session)

    response = client.patch(
        f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 30}
    )

    assert response.status_code == 200
    mock_send_message.assert_called_once()
    chat_id, mensaje = mock_send_message.call_args[0]
    assert chat_id == 12345
    assert "30" in mensaje


def test_rechazar_notifica_rechazo(client, db_session, mock_send_message):
    order = _create_order(db_session)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    mock_send_message.assert_called_once()
    _, mensaje = mock_send_message.call_args[0]
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
    _, mensaje = mock_send_message.call_args[0]
    assert texto_esperado in mensaje.lower()


def test_sin_telegram_chat_id_no_notifica(client, db_session, mock_send_message):
    order = _create_order(db_session, telegram_chat_id=None)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    mock_send_message.assert_not_called()


def test_telegram_chat_id_no_numerico_no_rompe_la_respuesta(client, db_session, mock_send_message):
    order = _create_order(db_session, telegram_chat_id="uuid-de-sesion-web-no-numerico")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    mock_send_message.assert_not_called()
