import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.modules.menu import Category, Product
from app.modules.order import Order, OrderItem

WEB_ORDERS_URL = "/api/v1/orders/web"


@pytest.fixture()
def public_client(db_session):
    """Cliente sin usuario autenticado: el endpoint de pedidos web y el menú son públicos."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def products(db_session):
    category = Category(name="Pizzas")
    db_session.add(category)
    db_session.flush()
    muzza = Product(name="Pizza Muzzarella", price=8500.0, category_id=category.id, dietary_restrictions=[])
    coca = Product(name="Coca-Cola 500ml", price=2500.0, category_id=category.id, dietary_restrictions=[])
    agotada = Product(
        name="Pizza Agotada", price=9000.0, category_id=category.id, dietary_restrictions=[], is_active=False
    )
    db_session.add_all([muzza, coca, agotada])
    db_session.commit()
    return {"muzza": muzza, "coca": coca, "agotada": agotada}


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


def test_crea_pedido_web_y_lo_persiste_como_los_del_bot(public_client, db_session, products):
    items = [
        {"product_id": products["muzza"].id, "quantity": 2},
        {"product_id": products["coca"].id, "quantity": 1},
    ]

    response = public_client.post(WEB_ORDERS_URL, json=_payload(items))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "Pendiente"
    assert body["total_amount"] == 2 * 8500.0 + 2500.0

    order = db_session.query(Order).filter(Order.id == body["id"]).one()
    assert order.source == "web"
    assert order.status == "Pendiente"
    assert order.customer_phone == "+54 11 5555-1234"
    assert order.notes == "Tocar timbre 2B"
    assert order.shipping_address == "Calle Falsa 123"
    assert {(i.product_id, i.quantity, i.unit_price) for i in order.items} == {
        (products["muzza"].id, 2, 8500.0),
        (products["coca"].id, 1, 2500.0),
    }


def test_pedido_web_aparece_en_el_listado_del_dashboard(public_client, client, products):
    response = public_client.post(WEB_ORDERS_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 1}]))
    assert response.status_code == 201

    listado = client.get("/api/v1/orders", params={"status": ["Pendiente"]})

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
