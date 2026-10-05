from unittest.mock import AsyncMock, MagicMock, patch

from app.db.session import get_db
from app.main import app


def test_raiz_responde_con_el_nombre_del_proyecto(public_client):
    response = public_client.get("/")

    assert response.status_code == 200
    assert "Bienvenido" in response.json()["message"]


def test_health_check_con_base_disponible(public_client):
    response = public_client.get("/api/v1/health-check")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_check_informa_si_la_base_no_responde(public_client):
    sesion_caida = MagicMock()
    sesion_caida.execute.side_effect = RuntimeError("connection refused")
    app.dependency_overrides[get_db] = lambda: sesion_caida

    response = public_client.get("/api/v1/health-check")

    assert response.status_code == 200
    assert response.json()["status"] == "error"
    assert "connection refused" in response.json()["database"]


def test_documentacion_openapi_disponible(public_client):
    response = public_client.get("/api/v1/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/orders/web" in response.json()["paths"]


def test_cors_permite_el_frontend_local(public_client):
    response = public_client.options(
        "/api/v1/menu/products",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_no_habilita_otros_origenes(public_client):
    response = public_client.options(
        "/api/v1/menu/products",
        headers={"Origin": "https://sitio-ajeno.com", "Access-Control-Request-Method": "GET"},
    )

    assert "access-control-allow-origin" not in response.headers


def test_chat_web_genera_una_sesion_nueva_si_no_se_envia(public_client):
    with patch(
        "app.api.chat_router.chat_service.obtener_respuesta", new_callable=AsyncMock, return_value="¡Hola!"
    ) as responder:
        response = public_client.post("/api/v1/chat/", json={"mensaje": "Hola"})

    assert response.status_code == 200
    body = response.json()
    assert body["respuesta"] == "¡Hola!"
    assert body["session_id"]
    responder.assert_awaited_once_with("Hola", session_id=body["session_id"])


def test_chat_web_continua_la_sesion_indicada(public_client):
    with patch(
        "app.api.chat_router.chat_service.obtener_respuesta", new_callable=AsyncMock, return_value="Perfecto"
    ) as responder:
        response = public_client.post("/api/v1/chat/", json={"mensaje": "Sí", "session_id": "sesion-1"})

    assert response.json()["session_id"] == "sesion-1"
    responder.assert_awaited_once_with("Sí", session_id="sesion-1")


def test_chat_web_requiere_mensaje(public_client):
    assert public_client.post("/api/v1/chat/", json={}).status_code == 422
