import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.models.security import SecurityAuditEvent
from app.schemas.store_config_schemas import StoreConfigUpdate
from app.services.store_config_service import update_store_config

SECURITY_URL = "/api/v1/security"
STATS_URL = "/api/v1/stats"
CASH_URL = "/api/v1/cash-shifts"


def test_stats_sin_pin_retorna_403(client):
    # Aseguramos que la petición no lleve headers de PIN
    client.headers.pop("X-Admin-PIN", None)
    client.headers.pop("X-Privileged-Token", None)

    response = client.get(f"{STATS_URL}/status-distribution")
    assert response.status_code == 403
    assert "PIN de administración" in response.json()["detail"]


def test_stats_con_pin_incorrecto_retorna_403(client):
    response = client.get(
        f"{STATS_URL}/status-distribution",
        headers={"X-Admin-PIN": "9999"},
    )
    assert response.status_code == 403


def test_verificar_admin_pin_exitoso(client, db_session):
    client.headers.pop("X-Admin-PIN", None)
    response = client.post(
        f"{SECURITY_URL}/verify-admin-pin",
        json={"pin": settings.ADMIN_PIN},
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["expires_in"] == 300

    # Usar el token recibido para consultar estadísticas
    res_stats = client.get(
        f"{STATS_URL}/status-distribution",
        headers={"X-Privileged-Token": data["token"]},
    )
    assert res_stats.status_code == 200

    # Verificar registro en auditoría
    event = (
        db_session.query(SecurityAuditEvent)
        .filter(SecurityAuditEvent.pin_type == "admin", SecurityAuditEvent.event_type == "pin_unlocked")
        .first()
    )
    assert event is not None


def test_bloqueo_por_tres_intentos_fallidos_y_auditoria(client, db_session):
    client.headers.pop("X-Admin-PIN", None)

    # Intento 1
    r1 = client.post(f"{SECURITY_URL}/verify-admin-pin", json={"pin": "0000"})
    assert r1.status_code == 403
    assert "2 intentos" in r1.json()["detail"]

    # Intento 2
    r2 = client.post(f"{SECURITY_URL}/verify-admin-pin", json={"pin": "0000"})
    assert r2.status_code == 403
    assert "1 intento" in r2.json()["detail"]

    # Intento 3 (activa bloqueo)
    r3 = client.post(f"{SECURITY_URL}/verify-admin-pin", json={"pin": "0000"})
    assert r3.status_code == 403
    assert "bloqueado temporalmente" in r3.json()["detail"].lower()

    # Intento 4 aún con PIN correcto se rechaza por estar bloqueado
    r4 = client.post(f"{SECURITY_URL}/verify-admin-pin", json={"pin": settings.ADMIN_PIN})
    assert r4.status_code == 403
    assert "bloqueado temporalmente" in r4.json()["detail"].lower()

    # Verificar eventos en la base de datos
    blocked_event = (
        db_session.query(SecurityAuditEvent)
        .filter(SecurityAuditEvent.pin_type == "admin", SecurityAuditEvent.event_type == "pin_blocked")
        .first()
    )
    assert blocked_event is not None
    assert "3 intentos fallidos" in blocked_event.details

    # Status informa bloqueo
    status_res = client.get(f"{SECURITY_URL}/pin-status")
    assert status_res.status_code == 200
    assert status_res.json()["admin_blocked"] is True
    assert status_res.json()["admin_blocked_seconds_remaining"] > 0


def test_configuracion_rechaza_cash_pin_igual_a_admin_pin():
    with pytest.raises(ValidationError) as exc:
        StoreConfigUpdate(
            store_name="RestoIT",
            theme_color="black",
            login_bg="bistro",
            panel_bg="none",
            cash_pin_enabled=True,
            cash_pin=settings.ADMIN_PIN,
        )
    assert "distinto al PIN de administración" in str(exc.value)


def test_cash_pin_habilita_proteccion_en_caja(client, db_session):
    # Habilitar PIN de caja
    update_store_config(
        db_session,
        StoreConfigUpdate(
            store_name="RestoIT",
            theme_color="black",
            login_bg="bistro",
            panel_bg="none",
            cash_pin_enabled=True,
            cash_pin="7777",
        ),
    )

    client.headers.pop("X-Admin-PIN", None)
    client.headers.pop("X-Cash-PIN", None)
    client.headers.pop("X-Cash-Privileged-Token", None)

    # Intentar abrir caja sin PIN -> 403
    res_open = client.post(
        f"{CASH_URL}/open",
        json={"initial_amount": 5000, "notes": "Apertura sin PIN"},
    )
    assert res_open.status_code == 403
    assert "PIN de caja" in res_open.json()["detail"]

    # Verificar PIN de caja incorrecto
    res_wrong = client.post(f"{SECURITY_URL}/verify-cash-pin", json={"pin": "1111"})
    assert res_wrong.status_code == 403

    # Verificar PIN de caja correcto
    res_verify = client.post(f"{SECURITY_URL}/verify-cash-pin", json={"pin": "7777"})
    assert res_verify.status_code == 200
    cash_token = res_verify.json()["token"]

    # Abrir caja con el token de caja obtenido
    res_open_ok = client.post(
        f"{CASH_URL}/open",
        json={"initial_amount": 5000, "notes": "Apertura autorizada"},
        headers={"X-Cash-Privileged-Token": cash_token},
    )
    assert res_open_ok.status_code == 201
    assert res_open_ok.json()["status"] == "abierta"
