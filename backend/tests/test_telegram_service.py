"""Envíos a la API de Telegram, con un transporte HTTP falso (sin salir a internet)."""

import asyncio
import json

import httpx
import pytest

from app.core.config import settings
from app.services import telegram_service


@pytest.fixture()
def telegram(monkeypatch):
    """Intercepta las llamadas a Telegram y deja configurar el código de respuesta."""
    estado = {"status": 200, "requests": []}

    def responder(request: httpx.Request) -> httpx.Response:
        estado["requests"].append(request)
        return httpx.Response(estado["status"], json={"ok": estado["status"] == 200})

    monkeypatch.setattr(
        telegram_service, "_cliente_telegram", lambda: httpx.AsyncClient(transport=httpx.MockTransport(responder))
    )
    return estado


def test_envia_el_mensaje_al_chat(telegram):
    asyncio.run(telegram_service.send_telegram_message(12345, "¡Tu pedido está en camino!"))

    [request] = telegram["requests"]
    assert request.url == f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendMessage"
    assert json.loads(request.content) == {"chat_id": 12345, "text": "¡Tu pedido está en camino!"}


def test_un_error_de_telegram_no_rompe_el_flujo(telegram, caplog):
    telegram["status"] = 400

    asyncio.run(telegram_service.send_telegram_message(12345, "Hola"))

    assert "Error al enviar mensaje a Telegram" in caplog.text


def test_indicador_de_escritura(telegram):
    asyncio.run(telegram_service.send_typing_action(12345))

    [request] = telegram["requests"]
    assert request.url.path.endswith("/sendChatAction")
    assert json.loads(request.content) == {"chat_id": 12345, "action": "typing"}


def test_si_falla_el_indicador_de_escritura_solo_se_registra(telegram, caplog):
    telegram["status"] = 500

    asyncio.run(telegram_service.send_typing_action(12345))

    assert "No se pudo enviar el indicador de escritura" in caplog.text


def test_sin_token_no_intenta_enviar(telegram, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_TOKEN", "")

    asyncio.run(telegram_service.send_telegram_message(12345, "Hola"))
    asyncio.run(telegram_service.send_typing_action(12345))

    assert telegram["requests"] == []


def test_reutiliza_la_conexion_dentro_del_mismo_event_loop(monkeypatch):
    monkeypatch.setattr(telegram_service, "_cliente", None)

    async def dos_pedidos():
        return telegram_service._cliente_telegram(), telegram_service._cliente_telegram()

    primero, segundo = asyncio.run(dos_pedidos())

    assert primero is segundo
    # En otro event loop se crea una conexión nueva (una conexión no se puede compartir entre loops).
    assert asyncio.run(dos_pedidos())[0] is not primero
