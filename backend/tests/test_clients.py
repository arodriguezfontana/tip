from unittest.mock import patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.modules.client import Client
from app.modules.menu import Category, Product
from app.modules.order import Order

COUNTER_URL = "/api/v1/orders/counter"
LOOKUP_URL = "/api/v1/clients/lookup"


@pytest.fixture()
def muzza(db_session):
    category = Category(name="Pizzas")
    db_session.add(category)
    db_session.flush()
    product = Product(name="Pizza Muzzarella", price=8500.0, category_id=category.id, dietary_restrictions=[])
    db_session.add(product)
    db_session.commit()
    return product


def _payload(product, **overrides):
    payload = {
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "delivery_method": "domicilio",
        "shipping_address": "Belgrano 95, Ramos Mejía",
        "notes": None,
        "items": [{"product_id": product.id, "quantity": 1}],
    }
    payload.update(overrides)
    return payload


def test_busqueda_de_cliente_registrado_devuelve_sus_datos(client, db_session):
    db_session.add(Client(phone="1144445555", full_name="Paula", address="Belgrano 95"))
    db_session.commit()

    response = client.get(LOOKUP_URL, params={"phone": "11 4444-5555"})

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Paula"
    assert body["address"] == "Belgrano 95"


def test_busqueda_de_telefono_inexistente_devuelve_404(client):
    response = client.get(LOOKUP_URL, params={"phone": "11 9999-0000"})

    assert response.status_code == 404


def test_confirmar_pedido_de_telefono_nuevo_registra_al_cliente(client, db_session, muzza):
    response = client.post(COUNTER_URL, json=_payload(muzza))

    assert response.status_code == 201
    registered = db_session.query(Client).one()
    assert registered.phone == "1144445555"
    assert registered.full_name == "Paula"
    assert registered.address == "Belgrano 95, Ramos Mejía"

    lookup = client.get(LOOKUP_URL, params={"phone": "1144445555"})
    assert lookup.status_code == 200
    assert lookup.json()["full_name"] == "Paula"


def test_confirmar_pedido_con_datos_editados_actualiza_al_cliente(client, db_session, muzza):
    db_session.add(Client(phone="1144445555", full_name="Paula", address="Belgrano 95"))
    db_session.commit()

    response = client.post(
        COUNTER_URL, json=_payload(muzza, customer_name="Paula Gómez", shipping_address="Rivadavia 1200")
    )

    assert response.status_code == 201
    updated = db_session.query(Client).one()
    assert updated.full_name == "Paula Gómez"
    assert updated.address == "Rivadavia 1200"


def test_pedido_para_retirar_no_borra_la_direccion_guardada(client, db_session, muzza):
    db_session.add(Client(phone="1144445555", full_name="Paula", address="Belgrano 95"))
    db_session.commit()

    response = client.post(COUNTER_URL, json=_payload(muzza, delivery_method="retiro", shipping_address=None))

    assert response.status_code == 201
    assert db_session.query(Client).one().address == "Belgrano 95"


def test_si_falla_la_agenda_el_pedido_igual_se_registra(client, db_session, muzza):
    with patch("app.services.web_order_service.upsert_client", side_effect=SQLAlchemyError("caída")):
        response = client.post(COUNTER_URL, json=_payload(muzza))

    assert response.status_code == 201
    assert db_session.query(Order).count() == 1
    assert db_session.query(Client).count() == 0
