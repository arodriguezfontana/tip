import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import get_db
from app.main import app
from app.modules.menu import Category, Product
from app.modules.order import Order
from app.modules.user import User

COUNTER_URL = "/api/v1/orders/counter"


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
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "delivery_method": "domicilio",
        "shipping_address": "Belgrano 95, Ramos Mejía",
        "notes": "Sin cebolla",
        "items": items,
    }
    payload.update(overrides)
    return payload


def test_registra_pedido_presencial_confirmado_con_demora(client, db_session, products):
    items = [
        {"product_id": products["muzza"].id, "quantity": 2},
        {"product_id": products["coca"].id, "quantity": 1},
    ]

    response = client.post(COUNTER_URL, json=_payload(items))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "Confirmado"
    assert body["total_amount"] == 2 * 8500.0 + 2500.0

    order = db_session.query(Order).one()
    assert order.source == "mostrador"
    assert order.status == "Confirmado"
    assert order.estimated_minutes is not None and order.estimated_minutes >= 15
    assert order.customer_phone == "11 4444-5555"
    assert order.notes == "Sin cebolla"
    assert len(order.items) == 2


def test_pedido_presencial_aparece_en_el_panel_de_comandas(client, products):
    client.post(COUNTER_URL, json=_payload([{"product_id": products["muzza"].id, "quantity": 1}]))

    response = client.get("/api/v1/orders", params={"status": ["Confirmado"]})

    assert response.status_code == 200
    assert [o["source"] for o in response.json()] == ["mostrador"]


def test_retiro_en_el_local_no_requiere_direccion(client, db_session, products):
    payload = _payload(
        [{"product_id": products["muzza"].id, "quantity": 1}], delivery_method="retiro", shipping_address=None
    )

    response = client.post(COUNTER_URL, json=payload)

    assert response.status_code == 201
    assert db_session.query(Order).one().shipping_address == "Retiro en el local"


@pytest.mark.parametrize(
    "overrides",
    [
        {"customer_name": ""},
        {"customer_phone": ""},
        {"shipping_address": None},
        {"items": []},
    ],
)
def test_valida_campos_obligatorios(client, db_session, products, overrides):
    payload = _payload([{"product_id": products["muzza"].id, "quantity": 1}])
    payload.update(overrides)

    response = client.post(COUNTER_URL, json=payload)

    assert response.status_code == 422
    assert db_session.query(Order).count() == 0


def test_rechaza_productos_no_disponibles(client, db_session, products):
    response = client.post(COUNTER_URL, json=_payload([{"product_id": products["agotada"].id, "quantity": 1}]))

    assert response.status_code == 400
    assert "Pizza Agotada" in response.json()["detail"]
    assert db_session.query(Order).count() == 0


@pytest.fixture()
def real_auth_client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_solo_el_personal_del_local_puede_cargar_pedidos_presenciales(real_auth_client, db_session, products):
    cliente = User(email="cliente@mail.com", hashed_password="x", role="CUSTOMER", is_active=True)
    db_session.add(cliente)
    db_session.commit()
    token_cliente = create_access_token(subject=str(cliente.id), role="CUSTOMER")
    payload = _payload([{"product_id": products["muzza"].id, "quantity": 1}])

    assert real_auth_client.post(COUNTER_URL, json=payload).status_code == 401
    assert (
        real_auth_client.post(COUNTER_URL, json=payload, headers={"Authorization": f"Bearer {token_cliente}"}).status_code
        == 403
    )
    assert db_session.query(Order).count() == 0
