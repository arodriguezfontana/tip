from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, hash_password
from app.db.session import get_db
from app.main import app
from app.modules.user import User


@pytest.fixture()
def real_auth_client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _user(db_session, role: str) -> User:
    user = User(email=f"{role.lower()}@local.com", hashed_password=hash_password("clave1234"), role=role, is_active=True)
    db_session.add(user)
    db_session.commit()
    return user


def _minutes_until_expiration(token: str) -> float:
    exp = datetime.fromtimestamp(decode_access_token(token)["exp"], tz=timezone.utc)
    return (exp - datetime.now(timezone.utc)).total_seconds() / 60


def test_sesion_del_admin_no_vence_a_los_60_minutos():
    token = create_access_token(subject="1", role="ADMIN")

    minutos = _minutes_until_expiration(token)

    assert minutos == pytest.approx(settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES, abs=1)
    assert minutos > timedelta(days=7).total_seconds() / 60


def test_sesion_del_cliente_mantiene_su_duracion():
    token = create_access_token(subject="1", role="CUSTOMER")

    assert _minutes_until_expiration(token) == pytest.approx(settings.ACCESS_TOKEN_EXPIRE_MINUTES, abs=1)


def test_login_del_admin_devuelve_token_de_larga_duracion(real_auth_client, db_session):
    _user(db_session, "ADMIN")

    response = real_auth_client.post("/api/v1/auth/login", json={"email": "admin@local.com", "password": "clave1234"})

    assert response.status_code == 200
    assert _minutes_until_expiration(response.json()["access_token"]) > 60 * 24


def test_admin_renueva_su_token(real_auth_client, db_session):
    admin = _user(db_session, "ADMIN")
    token_por_vencer = create_access_token(subject=str(admin.id), role="ADMIN", expires_delta=timedelta(minutes=5))

    response = real_auth_client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token_por_vencer}"})

    assert response.status_code == 200
    nuevo_token = response.json()["access_token"]
    assert decode_access_token(nuevo_token)["sub"] == str(admin.id)
    assert _minutes_until_expiration(nuevo_token) > 60 * 24


def test_cliente_no_puede_usar_la_renovacion_del_admin(real_auth_client, db_session):
    cliente = _user(db_session, "CUSTOMER")
    token = create_access_token(subject=str(cliente.id), role="CUSTOMER")

    response = real_auth_client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


def test_renovacion_requiere_sesion(real_auth_client):
    assert real_auth_client.post("/api/v1/auth/refresh").status_code == 401
