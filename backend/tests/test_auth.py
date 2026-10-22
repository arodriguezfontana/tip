from datetime import timedelta

import pytest

from app.core.security import create_access_token, decode_access_token
from tests.conftest import auth_headers, create_user

LOGIN_URL = "/api/v1/auth/login"
ME_URL = "/api/v1/auth/me"


def test_login_devuelve_token_con_el_rol_del_usuario(public_client, db_session):
    admin = create_user(db_session, "ADMIN", email="admin@local.com", password="clave1234")

    response = public_client.post(LOGIN_URL, json={"email": "admin@local.com", "password": "clave1234"})

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "ADMIN"
    assert body["token_type"] == "bearer"
    assert decode_access_token(body["access_token"])["sub"] == str(admin.id)


def test_login_no_distingue_mayusculas_ni_espacios_en_el_email(public_client, db_session):
    create_user(db_session, "ADMIN", email="admin@local.com", password="clave1234")

    response = public_client.post(LOGIN_URL, json={"email": "  Admin@Local.COM ", "password": "clave1234"})

    assert response.status_code == 200


@pytest.mark.parametrize(
    "email,password",
    [("admin@local.com", "incorrecta"), ("noexiste@local.com", "clave1234")],
)
def test_login_con_credenciales_invalidas_devuelve_401_sin_revelar_cual_fallo(public_client, db_session, email, password):
    create_user(db_session, "ADMIN", email="admin@local.com", password="clave1234")

    response = public_client.post(LOGIN_URL, json={"email": email, "password": password})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales inválidas"


def test_usuario_inactivo_no_puede_iniciar_sesion(public_client, db_session):
    create_user(db_session, "ADMIN", email="admin@local.com", password="clave1234", is_active=False)

    response = public_client.post(LOGIN_URL, json={"email": "admin@local.com", "password": "clave1234"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Usuario inactivo"


def test_login_valida_el_formato_del_email(public_client):
    response = public_client.post(LOGIN_URL, json={"email": "no-es-un-email", "password": "x"})

    assert response.status_code == 422


def test_me_devuelve_los_datos_del_usuario_sin_la_contrasena(public_client, db_session):
    user = create_user(db_session, "CUSTOMER", email="ana@mail.com", full_name="Ana", phone="11 5555-1234")

    response = public_client.get(ME_URL, headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "ana@mail.com"
    assert body["role"] == "CUSTOMER"
    assert body["full_name"] == "Ana"
    assert "hashed_password" not in body


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer token-invalido"},
        {"Authorization": "Basic dXNlcjpwYXNz"},
    ],
)
def test_me_sin_token_valido_devuelve_401(public_client, headers):
    response = public_client.get(ME_URL, headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_token_vencido_devuelve_401(public_client, db_session):
    user = create_user(db_session, "ADMIN")
    token = create_access_token(subject=str(user.id), role=user.role, expires_delta=timedelta(seconds=-1))

    response = public_client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_token_de_usuario_desactivado_deja_de_servir(public_client, db_session):
    user = create_user(db_session, "ADMIN")
    headers = auth_headers(user)
    user.is_active = False
    db_session.commit()

    assert public_client.get(ME_URL, headers=headers).status_code == 401


def test_token_de_usuario_inexistente_devuelve_401(public_client):
    token = create_access_token(subject="999", role="ADMIN")

    response = public_client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_token_firmado_con_otra_clave_es_rechazado(public_client, db_session):
    from jose import jwt

    user = create_user(db_session, "ADMIN")
    token = jwt.encode({"sub": str(user.id), "role": "ADMIN"}, "otra-clave", algorithm="HS256")

    response = public_client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_el_rol_se_toma_de_la_base_y_no_del_token(public_client, db_session):
    """Un cliente no puede entrar al panel fabricando un token que diga ADMIN con su propio id."""
    cliente = create_user(db_session, "CUSTOMER", email="cliente@mail.com")
    token = create_access_token(subject=str(cliente.id), role="ADMIN")

    response = public_client.get("/api/v1/orders", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


@pytest.mark.parametrize(
    "method,url",
    [
        ("get", "/api/v1/orders"),
        ("get", "/api/v1/orders/1"),
        ("post", "/api/v1/orders/counter"),
        ("patch", "/api/v1/orders/1/status"),
        ("get", "/api/v1/clients/lookup?phone=1144445555"),
        ("get", "/api/v1/stats/status-distribution"),
        ("get", "/api/v1/stats/top-products"),
        ("get", "/api/v1/stats/best-selling-day"),
        ("post", "/api/v1/auth/refresh"),
    ],
)
def test_endpoints_del_panel_exigen_sesion(public_client, method, url):
    response = getattr(public_client, method)(url)

    assert response.status_code == 401


@pytest.mark.parametrize(
    "method,url",
    [
        ("get", "/api/v1/orders/1"),
        ("post", "/api/v1/orders/counter"),
        ("get", "/api/v1/clients/lookup?phone=1144445555"),
        ("get", "/api/v1/stats/top-products"),
        ("get", "/api/v1/stats/best-selling-day"),
    ],
)
def test_endpoints_del_panel_rechazan_a_los_clientes(public_client, customer_headers, method, url):
    response = getattr(public_client, method)(url, headers=customer_headers)

    assert response.status_code == 403
