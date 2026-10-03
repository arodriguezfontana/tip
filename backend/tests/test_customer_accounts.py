import pytest

from app.modules.order import Order
from app.modules.user import User

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
PROFILE_URL = "/api/v1/customers/me"
WEB_ORDERS_URL = "/api/v1/orders/web"


def _register_payload(**overrides):
    payload = {
        "email": "Cliente@Mail.com",
        "password": "secreta123",
        "full_name": "Ana Gómez",
        "phone": "11 5555-1234",
        "address": "Calle Falsa 123",
    }
    payload.update(overrides)
    return payload


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(client, **overrides) -> str:
    response = client.post(REGISTER_URL, json=_register_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def test_registro_guarda_datos_basicos_y_deja_la_sesion_iniciada(public_client, db_session):
    response = public_client.post(REGISTER_URL, json=_register_payload())

    assert response.status_code == 201
    assert response.json()["role"] == "CUSTOMER"

    user = db_session.query(User).one()
    assert user.email == "cliente@mail.com"
    assert user.role == "CUSTOMER"
    assert (user.full_name, user.phone, user.address) == ("Ana Gómez", "11 5555-1234", "Calle Falsa 123")
    assert user.hashed_password != "secreta123"

    me = public_client.get("/api/v1/auth/me", headers=_auth(response.json()["access_token"]))
    assert me.status_code == 200
    assert me.json()["full_name"] == "Ana Gómez"
    assert me.json()["address"] == "Calle Falsa 123"


def test_registro_rechaza_email_duplicado_sin_importar_mayusculas(public_client):
    _register(public_client)

    response = public_client.post(REGISTER_URL, json=_register_payload(email="cliente@mail.com"))

    assert response.status_code == 409


@pytest.mark.parametrize(
    "overrides",
    [
        {"full_name": "  "},
        {"phone": "abc"},
        {"address": ""},
        {"email": "no-es-email"},
        {"password": "corta"},
        {"password": "x" * 73},
    ],
)
def test_registro_valida_los_datos(public_client, db_session, overrides):
    response = public_client.post(REGISTER_URL, json=_register_payload(**overrides))

    assert response.status_code == 422
    assert db_session.query(User).count() == 0


def test_login_de_cliente_registrado(public_client):
    _register(public_client)

    response = public_client.post(LOGIN_URL, json={"email": "cliente@mail.com", "password": "secreta123"})

    assert response.status_code == 200
    assert response.json()["role"] == "CUSTOMER"


def test_cliente_ve_y_actualiza_su_perfil(public_client, db_session):
    token = _register(public_client)

    perfil = public_client.get(PROFILE_URL, headers=_auth(token))
    assert perfil.status_code == 200
    assert perfil.json()["phone"] == "11 5555-1234"

    response = public_client.put(
        PROFILE_URL,
        headers=_auth(token),
        json={"full_name": "Ana María Gómez", "phone": "+54 11 4444-0000", "address": "Av. Siempreviva 742"},
    )

    assert response.status_code == 200
    assert response.json()["address"] == "Av. Siempreviva 742"
    user = db_session.query(User).one()
    assert (user.full_name, user.phone, user.address) == ("Ana María Gómez", "+54 11 4444-0000", "Av. Siempreviva 742")


def test_actualizar_perfil_valida_los_datos(public_client):
    token = _register(public_client)

    response = public_client.put(
        PROFILE_URL, headers=_auth(token), json={"full_name": "Ana", "phone": "abc", "address": "Calle 1"}
    )

    assert response.status_code == 422


def test_perfil_requiere_sesion_de_cliente(public_client, admin_headers):
    assert public_client.get(PROFILE_URL).status_code == 401
    assert public_client.get(PROFILE_URL, headers=admin_headers).status_code == 403


@pytest.mark.parametrize(
    "method,url",
    [
        ("get", "/api/v1/orders"),
        ("patch", "/api/v1/orders/1/status"),
        ("get", "/api/v1/stats/status-distribution"),
    ],
)
def test_cliente_no_accede_a_endpoints_del_panel(public_client, method, url):
    token = _register(public_client)

    response = getattr(public_client, method)(url, headers=_auth(token), **({"json": {"status": "Confirmado"}} if method == "patch" else {}))

    assert response.status_code == 403


def test_admin_sigue_accediendo_al_panel(public_client, admin_headers):
    assert public_client.get("/api/v1/orders", headers=admin_headers).status_code == 200


def _order_payload(product_id: int, **overrides):
    payload = {
        "customer_name": "Ana Gómez",
        "customer_phone": "11 5555-1234",
        "delivery_method": "domicilio",
        "shipping_address": "Calle Falsa 123",
        "items": [{"product_id": product_id, "quantity": 1}],
    }
    payload.update(overrides)
    return payload


def test_pedido_como_invitado_no_queda_asociado_a_una_cuenta(public_client, db_session, muzza):
    response = public_client.post(WEB_ORDERS_URL, json=_order_payload(muzza.id))

    assert response.status_code == 201
    assert db_session.query(Order).one().customer_id is None


def test_pedido_con_sesion_queda_asociado_y_respeta_los_datos_modificados(public_client, db_session, muzza):
    token = _register(public_client)
    payload = _order_payload(muzza.id, customer_phone="11 9999-0000", shipping_address="Oficina: Av. Corrientes 1000")

    response = public_client.post(WEB_ORDERS_URL, json=payload, headers=_auth(token))

    assert response.status_code == 201
    order = db_session.query(Order).one()
    customer = db_session.query(User).one()
    assert order.customer_id == customer.id
    assert order.customer_phone == "11 9999-0000"
    assert order.shipping_address == "Oficina: Av. Corrientes 1000"
    # Los datos modificados en el pedido no pisan los guardados en la cuenta.
    assert (customer.phone, customer.address) == ("11 5555-1234", "Calle Falsa 123")


def test_pedido_con_token_invalido_se_registra_como_invitado(public_client, db_session, muzza):
    response = public_client.post(WEB_ORDERS_URL, json=_order_payload(muzza.id), headers=_auth("token-vencido"))

    assert response.status_code == 201
    assert db_session.query(Order).one().customer_id is None
