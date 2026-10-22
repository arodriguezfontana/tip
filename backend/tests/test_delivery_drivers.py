from app.models.delivery_driver import DeliveryDriver
from app.models.order import Order


def _create_order(db_session, status="Confirmado", delivery_method="domicilio"):
    order = Order(
        customer_name="Esteban Quito",
        shipping_address="Calle Falsa 123",
        total_amount=5000.0,
        status=status,
        delivery_method=delivery_method,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def _create_driver(db_session, name="Carlos Repartidor", phone="1144445555", is_active=True):
    driver = DeliveryDriver(name=name, phone=phone, is_active=is_active)
    db_session.add(driver)
    db_session.commit()
    db_session.refresh(driver)
    return driver


def test_create_delivery_driver_succeeds(client):
    payload = {"name": "Juan Repartidor", "phone": "11 2233-4455", "is_active": True}
    response = client.post("/api/v1/delivery-drivers", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Juan Repartidor"
    assert data["phone"] == "1122334455"
    assert data["is_active"] is True
    assert "id" in data


def test_create_delivery_driver_validation_empty_name(client):
    response = client.post("/api/v1/delivery-drivers", json={"name": "   ", "phone": "1122334455"})
    assert response.status_code == 422


def test_create_delivery_driver_validation_invalid_phone(client):
    response = client.post("/api/v1/delivery-drivers", json={"name": "Juan", "phone": "abc"})
    assert response.status_code == 422


def test_list_delivery_drivers(client, db_session):
    _create_driver(db_session, name="Ana Gómez", phone="1111111111")
    _create_driver(db_session, name="Bruno Díaz", phone="2222222222")

    response = client.get("/api/v1/delivery-drivers")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = [d["name"] for d in data]
    assert "Ana Gómez" in names
    assert "Bruno Díaz" in names


def test_list_delivery_drivers_active_only(client, db_session):
    _create_driver(db_session, name="Activo Uno", phone="1111111111", is_active=True)
    _create_driver(db_session, name="Inactivo Dos", phone="2222222222", is_active=False)

    response = client.get("/api/v1/delivery-drivers?active_only=true")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Activo Uno"


def test_list_delivery_drivers_search(client, db_session):
    _create_driver(db_session, name="Roberto Gomez", phone="1155551234")
    _create_driver(db_session, name="Mariana Lopez", phone="1144449876")

    response = client.get("/api/v1/delivery-drivers?search=1234")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Roberto Gomez"

    response_name = client.get("/api/v1/delivery-drivers?search=mariana")
    assert response_name.status_code == 200
    data_name = response_name.json()
    assert len(data_name) == 1
    assert data_name[0]["name"] == "Mariana Lopez"


def test_get_and_update_delivery_driver(client, db_session):
    driver = _create_driver(db_session, name="Pedro Pascal", phone="1166667777", is_active=True)

    get_resp = client.get(f"/api/v1/delivery-drivers/{driver.id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Pedro Pascal"

    put_resp = client.put(
        f"/api/v1/delivery-drivers/{driver.id}",
        json={"name": "Pedro Pascal Jr.", "phone": "1188889999", "is_active": False},
    )
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["name"] == "Pedro Pascal Jr."
    assert updated["phone"] == "1188889999"
    assert updated["is_active"] is False


def test_update_nonexistent_driver(client):
    response = client.put(
        "/api/v1/delivery-drivers/9999",
        json={"name": "Inexistente", "phone": "1122334455", "is_active": True},
    )
    assert response.status_code == 404


def test_assign_driver_to_domicilio_order(client, db_session):
    order = _create_order(db_session, status="En Camino", delivery_method="domicilio")
    driver = _create_driver(db_session, name="Marcos Reparto", phone="1133334444", is_active=True)

    response = client.patch(
        f"/api/v1/orders/{order.id}/delivery-driver",
        json={"delivery_driver_id": driver.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["delivery_driver_id"] == driver.id
    assert data["delivery_driver_name"] == "Marcos Reparto"


def test_assign_driver_to_pickup_order_fails(client, db_session):
    order = _create_order(db_session, status="Confirmado", delivery_method="retiro")
    driver = _create_driver(db_session, is_active=True)

    response = client.patch(
        f"/api/v1/orders/{order.id}/delivery-driver",
        json={"delivery_driver_id": driver.id},
    )
    assert response.status_code == 400
    assert "Solo se pueden asignar repartidores a pedidos con envío a domicilio" in response.json()["detail"]


def test_assign_inactive_driver_fails(client, db_session):
    order = _create_order(db_session, status="En Camino", delivery_method="domicilio")
    driver = _create_driver(db_session, is_active=False)

    response = client.patch(
        f"/api/v1/orders/{order.id}/delivery-driver",
        json={"delivery_driver_id": driver.id},
    )
    assert response.status_code == 400
    assert "Solo se pueden asignar repartidores activos" in response.json()["detail"]


def test_assign_nonexistent_driver_fails(client, db_session):
    order = _create_order(db_session, status="En Camino", delivery_method="domicilio")

    response = client.patch(
        f"/api/v1/orders/{order.id}/delivery-driver",
        json={"delivery_driver_id": 9999},
    )
    assert response.status_code == 404


def test_unassign_driver(client, db_session):
    order = _create_order(db_session, status="En Camino", delivery_method="domicilio")
    driver = _create_driver(db_session, is_active=True)

    client.patch(
        f"/api/v1/orders/{order.id}/delivery-driver",
        json={"delivery_driver_id": driver.id},
    )
    unassign_resp = client.patch(
        f"/api/v1/orders/{order.id}/delivery-driver",
        json={"delivery_driver_id": None},
    )
    assert unassign_resp.status_code == 200
    assert unassign_resp.json()["delivery_driver_id"] is None
    assert unassign_resp.json()["delivery_driver_name"] is None


def test_order_status_update_with_driver_assignment(client, db_session):
    order = _create_order(db_session, status="Confirmado", delivery_method="domicilio")
    driver = _create_driver(db_session, name="Luciano Delivery", is_active=True)

    response = client.patch(
        f"/api/v1/orders/{order.id}/status",
        json={"status": "En Camino", "delivery_driver_id": driver.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "En Camino"
    assert data["delivery_driver_id"] == driver.id
    assert data["delivery_driver_name"] == "Luciano Delivery"


def test_public_client_cannot_access_drivers(public_client):
    response = public_client.get("/api/v1/delivery-drivers")
    assert response.status_code in (401, 403)
