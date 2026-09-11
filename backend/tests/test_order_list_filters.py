from app.modules.order import Order


def _create_order(db_session, status):
    order = Order(
        customer_name="Juan Perez",
        shipping_address="Av. Siempreviva 742",
        total_amount=1000.0,
        status=status,
    )
    db_session.add(order)
    db_session.commit()
    return order


def test_list_orders_filters_by_status(client, db_session):
    _create_order(db_session, "Pendiente")
    _create_order(db_session, "Confirmado")
    _create_order(db_session, "Finalizado")
    _create_order(db_session, "Rechazado")

    response = client.get("/api/v1/orders", params={"status": ["Pendiente", "Confirmado"]})

    assert response.status_code == 200
    statuses = {order["status"] for order in response.json()}
    assert statuses == {"Pendiente", "Confirmado"}


def test_list_orders_without_status_filter_returns_all(client, db_session):
    _create_order(db_session, "Pendiente")
    _create_order(db_session, "Finalizado")
    _create_order(db_session, "Rechazado")

    response = client.get("/api/v1/orders")

    assert response.status_code == 200
    assert len(response.json()) == 3
