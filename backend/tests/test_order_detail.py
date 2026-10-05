from app.modules.order import Order, OrderItem

COUNTER_URL = "/api/v1/orders/counter"


def _counter_payload(products, **overrides):
    payload = {
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "delivery_method": "domicilio",
        "shipping_address": "Belgrano 95, Ramos Mejía",
        "notes": "Sin cebolla",
        "items": [
            {"product_id": products["muzza"].id, "quantity": 2},
            {"product_id": products["coca"].id, "quantity": 1},
        ],
    }
    payload.update(overrides)
    return payload


def test_detalle_incluye_productos_cliente_entrega_y_facturacion(client, products):
    created = client.post(
        COUNTER_URL, json=_counter_payload(products, payment_method="transferencia", is_paid=True)
    ).json()

    response = client.get(f"/api/v1/orders/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created["id"]
    assert body["status"] == "Confirmado"
    assert body["created_at"]
    assert body["customer_name"] == "Paula"
    assert body["customer_phone"] == "11 4444-5555"
    assert body["shipping_address"] == "Belgrano 95, Ramos Mejía"
    assert body["delivery_method"] == "domicilio"
    assert body["notes"] == "Sin cebolla"
    assert sorted((i["product_name"], i["quantity"], i["unit_price"]) for i in body["items"]) == [
        ("Coca-Cola 500ml", 1, 2500.0),
        ("Pizza Muzzarella", 2, 8500.0),
    ]
    assert body["subtotal"] == 19500.0
    assert body["shipping_cost"] == 0
    assert body["total_amount"] == 19500.0
    assert body["payment_method"] == "transferencia"
    assert body["is_paid"] is True


def test_pedidos_sin_datos_de_pago_quedan_sin_informar_e_impagos(client, db_session, products):
    order = Order(
        customer_name="Bot",
        shipping_address="Retiro en el local",
        delivery_method="retiro",
        total_amount=8500.0,
        status="Pendiente",
        source="bot",
    )
    order.items = [OrderItem(product_id=products["muzza"].id, quantity=1, unit_price=8500.0)]
    db_session.add(order)
    db_session.commit()

    body = client.get(f"/api/v1/orders/{order.id}").json()

    assert body["payment_method"] is None
    assert body["is_paid"] is False
    assert body["shipping_cost"] == 0


def test_detalle_de_pedido_inexistente_devuelve_404(client):
    assert client.get("/api/v1/orders/9999").status_code == 404


def test_pedido_presencial_rechaza_metodo_de_pago_invalido(client, products):
    response = client.post(COUNTER_URL, json=_counter_payload(products, payment_method="bitcoin"))

    assert response.status_code == 422


def test_pedido_web_ignora_datos_de_pago_enviados_por_el_cliente(client, db_session, products):
    response = client.post(
        "/api/v1/orders/web", json=_counter_payload(products, payment_method="efectivo", is_paid=True)
    )

    assert response.status_code == 201
    order = db_session.query(Order).one()
    assert order.is_paid is False
    assert order.payment_method is None
