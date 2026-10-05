from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import settings

WEBHOOK_URL = "/api/v1/telegram/webhook"


def _update(texto="Hola", chat_id=12345):
    return {"update_id": 1, "message": {"message_id": 7, "chat": {"id": chat_id}, "text": texto}}


@pytest.fixture()
def procesar():
    with patch(
        "app.api.telegram_router.telegram_service.procesar_y_enviar", new_callable=AsyncMock
    ) as mock:
        yield mock


@pytest.fixture()
def secreto(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", "secreto-del-webhook")
    return "secreto-del-webhook"


def test_mensaje_de_texto_se_procesa_en_segundo_plano(public_client, procesar):
    response = public_client.post(WEBHOOK_URL, json=_update("Quiero una muzza", chat_id=98765))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    procesar.assert_awaited_once_with("98765", "Quiero una muzza")


@pytest.mark.parametrize(
    "update",
    [
        {"update_id": 1, "message": {"message_id": 7, "chat": {"id": 1}, "sticker": {"file_id": "x"}}},
        {"update_id": 1, "edited_message": {"message_id": 7, "chat": {"id": 1}, "text": "editado"}},
        {"update_id": 1, "callback_query": {"id": "1"}},
    ],
)
def test_actualizaciones_sin_texto_se_ignoran_pero_se_confirman(public_client, procesar, update):
    """Telegram reintenta las actualizaciones no confirmadas: siempre hay que responder 200."""
    response = public_client.post(WEBHOOK_URL, json=update)

    assert response.status_code == 200
    procesar.assert_not_awaited()


def test_con_secreto_configurado_rechaza_pedidos_sin_el_header(public_client, procesar, secreto):
    response = public_client.post(WEBHOOK_URL, json=_update())

    assert response.status_code == 403
    procesar.assert_not_awaited()


def test_con_secreto_configurado_rechaza_un_header_incorrecto(public_client, procesar, secreto):
    response = public_client.post(
        WEBHOOK_URL, json=_update(), headers={"X-Telegram-Bot-Api-Secret-Token": "otro"}
    )

    assert response.status_code == 403
    procesar.assert_not_awaited()


def test_con_secreto_configurado_acepta_el_header_correcto(public_client, procesar, secreto):
    response = public_client.post(
        WEBHOOK_URL, json=_update(), headers={"X-Telegram-Bot-Api-Secret-Token": secreto}
    )

    assert response.status_code == 200
    procesar.assert_awaited_once()
