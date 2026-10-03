from datetime import datetime, timezone

from app.modules.order import Order, OrderItem


def _create_order(db_session, status, created_at=None, **extra):
    if created_at is not None:
        extra["created_at"] = created_at
    order = Order(
        customer_name="Juan Perez",
        shipping_address="Av. Siempreviva 742",
        total_amount=1000.0,
        status=status,
        **extra,
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


def test_list_orders_filters_by_date_range_inclusive(client, db_session):
    _create_order(db_session, "Finalizado", created_at=datetime(2026, 9, 27, 12, tzinfo=timezone.utc))
    dentro_desde = _create_order(db_session, "Finalizado", created_at=datetime(2026, 9, 28, 0, tzinfo=timezone.utc))
    dentro_hasta = _create_order(db_session, "Finalizado", created_at=datetime(2026, 9, 30, 23, 59, tzinfo=timezone.utc))
    _create_order(db_session, "Finalizado", created_at=datetime(2026, 10, 1, 0, 1, tzinfo=timezone.utc))

    response = client.get(
        "/api/v1/orders",
        params={"date_from": "2026-09-28T00:00:00Z", "date_to": "2026-09-30T23:59:00Z"},
    )

    assert response.status_code == 200
    assert {o["id"] for o in response.json()} == {dentro_desde.id, dentro_hasta.id}


def test_list_orders_combines_date_and_status_filters(client, db_session):
    _create_order(db_session, "Pendiente", created_at=datetime(2026, 9, 28, 12, tzinfo=timezone.utc))
    esperado = _create_order(db_session, "Finalizado", created_at=datetime(2026, 9, 28, 13, tzinfo=timezone.utc))
    _create_order(db_session, "Finalizado", created_at=datetime(2026, 9, 20, 13, tzinfo=timezone.utc))

    response = client.get(
        "/api/v1/orders", params={"status": ["Finalizado"], "date_from": "2026-09-28T00:00:00Z"}
    )

    assert [o["id"] for o in response.json()] == [esperado.id]


def test_list_orders_returns_newest_first(client, db_session):
    viejo = _create_order(db_session, "Pendiente", created_at=datetime(2026, 9, 28, 10, tzinfo=timezone.utc))
    nuevo = _create_order(db_session, "Pendiente", created_at=datetime(2026, 9, 28, 12, tzinfo=timezone.utc))
    medio = _create_order(db_session, "Pendiente", created_at=datetime(2026, 9, 28, 11, tzinfo=timezone.utc))

    ids = [o["id"] for o in client.get("/api/v1/orders").json()]

    assert ids == [nuevo.id, medio.id, viejo.id]


def test_list_orders_includes_dashboard_fields(client, db_session, products):
    order = _create_order(
        db_session,
        "Confirmado",
        delivery_method="retiro",
        source="mostrador",
        customer_phone="11 4444-5555",
        notes="Sin cebolla",
        estimated_minutes=20,
    )
    order.items = [
        OrderItem(product_id=products["muzza"].id, quantity=2, unit_price=8500.0),
        OrderItem(product_id=products["coca"].id, quantity=1, unit_price=2500.0),
    ]
    db_session.commit()

    [body] = client.get("/api/v1/orders").json()

    assert body["item_count"] == 2
    assert body["source"] == "mostrador"
    assert body["delivery_method"] == "retiro"
    assert body["customer_phone"] == "11 4444-5555"
    assert body["notes"] == "Sin cebolla"
    assert body["estimated_minutes"] == 20
    assert body["scheduled_for"] is None
    assert body["created_at"]


def test_list_orders_rejects_invalid_dates(client):
    assert client.get("/api/v1/orders", params={"date_from": "ayer"}).status_code == 422
