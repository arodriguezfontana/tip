from unittest.mock import patch

import pytest

from app.core.config import settings

WEBHOOK_URL = "/api/v1/telegram/webhook"


def _update(texto="Hola", chat_id=12345):
    return {"update_id": 1, "message": {"message_id": 7, "chat": {"id": chat_id}, "text": texto}}


def _headers_de_telegram() -> dict:
    """Telegram manda en cada llamada el secreto con el que se registró el webhook."""
    return {"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret}


@pytest.fixture()
def procesar():
    with patch("app.api.telegram_router.telegram_service.recibir_mensaje") as mock:
        yield mock


@pytest.fixture()
def secreto(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", "secreto-del-webhook")
    return "secreto-del-webhook"


def test_mensaje_de_texto_se_encola_para_responderlo(public_client, procesar):
    response = public_client.post(
        WEBHOOK_URL, json=_update("Quiero una muzza", chat_id=98765), headers=_headers_de_telegram()
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    procesar.assert_called_once_with("98765", "Quiero una muzza")


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
    response = public_client.post(WEBHOOK_URL, json=update, headers=_headers_de_telegram())

    assert response.status_code == 200
    procesar.assert_not_called()


def test_sin_secreto_configurado_igual_exige_uno_derivado_del_token(public_client, procesar, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")

    assert public_client.post(WEBHOOK_URL, json=_update()).status_code == 403
    assert settings.telegram_webhook_secret not in ("", settings.TELEGRAM_TOKEN)
    assert public_client.post(WEBHOOK_URL, json=_update(), headers=_headers_de_telegram()).status_code == 200
    procesar.assert_called_once()


def test_con_secreto_configurado_rechaza_pedidos_sin_el_header(public_client, procesar, secreto):
    response = public_client.post(WEBHOOK_URL, json=_update())

    assert response.status_code == 403
    procesar.assert_not_called()


def test_con_secreto_configurado_rechaza_un_header_incorrecto(public_client, procesar, secreto):
    response = public_client.post(
        WEBHOOK_URL, json=_update(), headers={"X-Telegram-Bot-Api-Secret-Token": "otro"}
    )

    assert response.status_code == 403
    procesar.assert_not_called()


def test_con_secreto_configurado_acepta_el_header_correcto(public_client, procesar, secreto):
    response = public_client.post(
        WEBHOOK_URL, json=_update(), headers={"X-Telegram-Bot-Api-Secret-Token": secreto}
    )

    assert response.status_code == 200
    procesar.assert_called_once()
