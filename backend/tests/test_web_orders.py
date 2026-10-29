from unittest.mock import patch

import pytest

from app.models.menu import Product
from app.models.order import Order, OrderItem

WEB_ORDERS_URL = "/api/v1/orders/web"


def _payload(items, **overrides):
    payload = {
        "customer_name": "Ana Gómez",
        "customer_phone": "+54 11 5555-1234",
        "delivery_method": "domicilio",
        "shipping_address": "Calle Falsa 123",
        "notes": "Tocar timbre 2B",
        "items": items,
    }
    payload.update(overrides)
    return payload


def test_crea_pedido_web_aceptado_automaticamente(public_client, db_session, products):
    items = [
        {"product_id": products["muzza"].id, "quantity": 2},
        {"product_id": products["coca"].id, "quantity": 1},
    ]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))

    assert response.status_code == 201
    body = response.json()
    # Los pedidos web no pasan por aceptar/rechazar: entran confirmados con la demora estimada.
    assert body["status"] == "Confirmado"
    assert body["total_amount"] == 2 * 8500.0 + 2500.0

    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert order.source == "web"
    assert order.status == "Confirmado"
    assert order.estimated_minutes == 15
    assert order.customer_phone == "1155551234"
    assert order.notes == "Tocar timbre 2B"
    assert order.shipping_address == "Calle Falsa 123"
    assert {(i.product_id, i.quantity, i.unit_price) for i in order.items} == {
        (products["muzza"].id, 2, 8500.0),
        (products["coca"].id, 1, 2500.0),
    }


def test_pedido_web_aparece_en_el_listado_del_dashboard(public_client, client, products):
    response = public_client.post(WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 1}]))
    assert response.status_code == 201

    listado = client.get("/api/v1/orders", params={"status": ["Confirmado"]})

    assert listado.status_code == 200
    pedidos = listado.json()
    assert len(pedidos) == 1
    assert pedidos[0]["id"] == response.json()["id"]
    assert pedidos[0]["source"] == "web"
    assert pedidos[0]["item_count"] == 1


def test_usa_precios_de_la_base_y_no_los_del_cliente(public_client, products):
    items = [{"product_id": products["muzza"].id, "quantity": 1, "unit_price": 1}]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items, total_amount=1))

    assert response.status_code == 201
    assert response.json()["total_amount"] == 8500.0


def test_retiro_no_requiere_direccion(public_client, db_session, products):
    payload = _payload(
        [{"product_id": products["muzza"].id, "quantity": 1}], delivery_method="retiro", shipping_address=None
    )

    response = public_client.post(WEB_ORDERS_URL, json=payload)

    assert response.status_code == 201
    order = db_session.query(Order).one()
    assert order.delivery_method == "retiro"
    assert order.shipping_address == "Retiro en el local"


def test_agrupa_lineas_repetidas_del_mismo_producto(public_client, db_session, products):
    items = [
        {"product_id": products["muzza"].id, "quantity": 1},
        {"product_id": products["muzza"].id, "quantity": 2},
    ]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))

    assert response.status_code == 201
    order_item = db_session.query(OrderItem).one()
    assert order_item.quantity == 3


def test_rechaza_producto_inexistente(public_client, db_session, products):
    response = public_client.post(WEB_ORDERS_URL, json=_payload([{"product_id": 9999, "quantity": 1}]))

    assert response.status_code == 400
    assert "no existen" in response.json()["detail"]
    assert db_session.query(Order).count() == 0


def test_rechaza_producto_no_disponible(public_client, db_session, products):
    items = [
        {"product_id": products["muzza"].id, "quantity": 1},
        {"product_id": products["agotada"].id, "quantity": 1},
    ]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))

    assert response.status_code == 400
    assert "Pizza Agotada" in response.json()["detail"]
    assert db_session.query(Order).count() == 0


def test_rechaza_cantidad_acumulada_mayor_al_maximo(public_client, db_session, products):
    items = [
        {"product_id": products["muzza"].id, "quantity": 15},
        {"product_id": products["muzza"].id, "quantity": 10},
    ]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))

    assert response.status_code == 400
    assert "cantidad máxima" in response.json()["detail"]
    assert db_session.query(Order).count() == 0


def test_rechaza_cantidad_mayor_al_maximo_con_mensaje_claro(public_client, db_session, products):
    response = public_client.post(WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 21}]))

    assert response.status_code == 400
    assert "Pizza Muzzarella" in response.json()["detail"]
    assert db_session.query(Order).count() == 0


@pytest.mark.parametrize("quantity", [0, -1])
def test_rechaza_cantidades_invalidas(public_client, db_session, products, quantity):
    response = public_client.post(
        WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": quantity}])
    )

    assert response.status_code == 422
    assert db_session.query(Order).count() == 0


@pytest.mark.parametrize(
    "overrides",
    [
        {"items": []},
        {"customer_name": "   "},
        {"customer_phone": "abc"},
        {"delivery_method": "drone"},
        {"shipping_address": None},
        {"shipping_address": "  "},
    ],
)
def test_rechaza_datos_del_cliente_invalidos(public_client, db_session, products, overrides):
    payload = _payload([{"product_id": products["muzza"].id, "quantity": 1}])
    payload.update(overrides)

    response = public_client.post(WEB_ORDERS_URL, json=payload)

    assert response.status_code == 422
    assert db_session.query(Order).count() == 0


def test_menu_publico_solo_devuelve_productos_disponibles(public_client, products):
    response = public_client.get("/api/v1/menu/products")

    assert response.status_code == 200
    nombres = {p["name"] for p in response.json()}
    assert nombres == {"Pizza Muzzarella", "Coca-Cola 500ml"}
    assert response.json()[0]["category"]["name"] == "Pizzas"


def test_pedido_web_en_efectivo_queda_pendiente_de_pago_sin_link(public_client, db_session, products):
    response = public_client.post(WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 1}]))

    assert response.status_code == 201
    body = response.json()
    assert body["payment_method"] == "efectivo"
    assert body["is_paid"] is False
    assert body["payment_url"] is None


def test_pedido_web_con_mercadopago_devuelve_link_de_pago_por_el_total(public_client, db_session, products):
    items = [{"product_id": products["muzza"].id, "quantity": 2}]
    with patch(
        "app.api.order_router.start_web_payment", return_value="https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc"
    ) as start:
        response = public_client.post(WEB_ORDERS_URL, json=_payload(items, payment_method="mercadopago"))

    assert response.status_code == 201
    body = response.json()
    assert body["payment_url"] == "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc"
    assert body["payment_method"] == "mercadopago"
    assert body["is_paid"] is False
    assert body["status"] == "Confirmado"

    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert order.payment_method == "mercadopago"
    assert order.is_paid is False
    assert start.call_args.args[1].id == order.id


def test_pedido_web_con_mercadopago_guarda_la_preferencia(public_client, db_session, products):
    response = public_client.post(
        WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 1}], payment_method="mercadopago")
    )

    body = response.json()
    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    # Sin credenciales (tests/desarrollo) se usa la preferencia simulada.
    assert order.mp_preference_id == f"mp-pref-{order.id}"
    assert body["payment_url"].endswith(order.mp_preference_id)


@pytest.mark.parametrize("payment_method", ["tarjeta", "transferencia"])
def test_pedido_web_rechaza_medios_de_pago_no_ofrecidos(public_client, products, payment_method):
    response = public_client.post(
        WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 1}], payment_method=payment_method)
    )

    assert response.status_code == 422


def test_pedido_web_pizza_mitad_y_mitad_cobra_gusto_mas_caro(public_client, client, db_session, products):
    napo = Product(
        name="Pizza Napolitana",
        price=9500.0,
        category_id=products["muzza"].category_id,
        dietary_restrictions=[],
    )
    db_session.add(napo)
    db_session.commit()

    items = [
        {
            "product_id": products["muzza"].id,
            "quantity": 2,
            "secondary_product_id": napo.id,
        }
    ]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))
    assert response.status_code == 201
    body = response.json()
    assert body["total_amount"] == 2 * 9500.0
    assert body["items"][0]["product_name"] == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"
    assert body["items"][0]["secondary_product_id"] == napo.id

    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert len(order.items) == 1
    item = order.items[0]
    assert item.product_id == products["muzza"].id
    assert item.secondary_product_id == napo.id
    assert item.unit_price == 9500.0
    assert item.display_name == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"

    # Verificación en la comanda / detalle de gestión
    comanda = client.get(f"/api/v1/orders/{order.id}")
    assert comanda.status_code == 200
    assert comanda.json()["items"][0]["product_name"] == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"


def test_pedido_web_pizza_mitad_y_mitad_valida_disponibilidad_ambos_gustos(public_client, db_session, products):
    # Gusto secundario agotado
    items = [
        {
            "product_id": products["muzza"].id,
            "quantity": 1,
            "secondary_product_id": products["agotada"].id,
        }
    ]
    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))
    assert response.status_code == 400
    assert "Pizza Agotada" in response.json()["detail"]

    # Gusto secundario inexistente
    items_inexistente = [
        {
            "product_id": products["muzza"].id,
            "quantity": 1,
            "secondary_product_id": 99999,
        }
    ]
    response2 = public_client.post(WEB_ORDERS_URL, json=_payload(items_inexistente))
    assert response2.status_code == 400
    assert "no existen" in response2.json()["detail"]

