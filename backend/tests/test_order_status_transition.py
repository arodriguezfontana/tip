import pytest

from app.api.deps import get_current_user
from app.main import app
from app.modules.order import Order


def _create_order(db_session, status="Pendiente", delivery_method="domicilio"):
    order = Order(
        customer_name="Juan Perez",
        shipping_address="Av. Siempreviva 742",
        total_amount=1000.0,
        status=status,
        delivery_method=delivery_method,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def test_pendiente_to_confirmado_succeeds(client, db_session):
    order = _create_order(db_session)

    response = client.patch(
        f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 30}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "Confirmado"
    assert response.json()["estimated_minutes"] == 30


def test_confirmar_sin_estimated_minutes_is_rejected(client, db_session):
    order = _create_order(db_session)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado"})

    assert response.status_code == 400


@pytest.mark.parametrize("estimated_minutes", [0, -5])
def test_confirmar_con_estimated_minutes_invalido_is_rejected(client, db_session, estimated_minutes):
    order = _create_order(db_session)

    response = client.patch(
        f"/api/v1/orders/{order.id}/status",
        json={"status": "Confirmado", "estimated_minutes": estimated_minutes},
    )

    assert response.status_code == 422


def test_confirmado_to_en_camino_succeeds_for_domicilio(client, db_session):
    order = _create_order(db_session, status="Confirmado", delivery_method="domicilio")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "En Camino"})

    assert response.status_code == 200
    assert response.json()["status"] == "En Camino"


def test_confirmado_to_listo_para_retirar_succeeds_for_retiro(client, db_session):
    order = _create_order(db_session, status="Confirmado", delivery_method="retiro")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Listo para Retirar"})

    assert response.status_code == 200
    assert response.json()["status"] == "Listo para Retirar"


def test_pendiente_to_rechazado_succeeds(client, db_session):
    order = _create_order(db_session)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 200
    assert response.json()["status"] == "Rechazado"


@pytest.mark.parametrize("terminal_status", ["En Camino", "Listo para Retirar"])
def test_en_camino_or_listo_to_finalizado_succeeds(client, db_session, terminal_status):
    order = _create_order(db_session, status=terminal_status)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Finalizado"})

    assert response.status_code == 200
    assert response.json()["status"] == "Finalizado"


def test_confirmado_to_rechazado_is_rejected(client, db_session):
    order = _create_order(db_session, status="Confirmado")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    assert response.status_code == 409


def test_skipping_a_step_is_rejected(client, db_session):
    order = _create_order(db_session, status="Pendiente")

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "En Camino"})

    assert response.status_code == 409


@pytest.mark.parametrize("terminal_status", ["Finalizado", "Rechazado"])
def test_transition_from_terminal_status_is_rejected(client, db_session, terminal_status):
    order = _create_order(db_session, status=terminal_status)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado"})

    assert response.status_code == 409


def test_invalid_status_value_is_rejected(client, db_session):
    order = _create_order(db_session)

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Bogus"})

    assert response.status_code == 422


def test_order_not_found_returns_404(client, db_session):
    response = client.patch("/api/v1/orders/9999/status", json={"status": "Confirmado"})

    assert response.status_code == 404


def test_requires_authentication(client, db_session):
    order = _create_order(db_session)
    del app.dependency_overrides[get_current_user]

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado"})

    assert response.status_code == 401
