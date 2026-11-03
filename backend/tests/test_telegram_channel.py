"""Envíos a la API de Telegram, con un transporte HTTP falso (sin salir a internet)."""

import asyncio
import json

import httpx
import pytest

from app.core.channels import Channel
from app.core.config import settings
from app.services.channels import TelegramChannel, enviar_mensaje, obtener_canal


@pytest.fixture()
def canal():
    return obtener_canal(Channel.TELEGRAM)


@pytest.fixture()
def telegram(monkeypatch, canal):
    """Intercepta las llamadas a Telegram y deja configurar el código de respuesta."""
    estado = {"status": 200, "requests": []}

    def responder(request: httpx.Request) -> httpx.Response:
        estado["requests"].append(request)
        return httpx.Response(estado["status"], json={"ok": estado["status"] == 200})

    monkeypatch.setattr(canal, "_cliente", lambda: httpx.AsyncClient(transport=httpx.MockTransport(responder)))
    return estado


def test_envia_el_mensaje_al_chat(telegram, canal):
    asyncio.run(canal.enviar_mensaje("12345", "¡Tu pedido está en camino!"))

    [request] = telegram["requests"]
    assert request.url == f"https://api.telegram.org/bot{settings.TELEGRAM_TOKEN}/sendMessage"
    assert json.loads(request.content) == {"chat_id": 12345, "text": "¡Tu pedido está en camino!"}


def test_un_error_de_telegram_no_rompe_el_flujo(telegram, canal, caplog):
    telegram["status"] = 400

    asyncio.run(canal.enviar_mensaje("12345", "Hola"))

    assert "Error al enviar mensaje a Telegram" in caplog.text


def test_un_chat_no_numerico_no_se_envia(telegram, canal, caplog):
    asyncio.run(canal.enviar_mensaje("uuid-de-sesion-de-prueba", "Hola"))

    assert telegram["requests"] == []
    assert "chat_id de Telegram inválido" in caplog.text


def test_indicador_de_escritura(telegram, canal):
    asyncio.run(canal.enviar_escribiendo("12345"))

    [request] = telegram["requests"]
    assert request.url.path.endswith("/sendChatAction")
    assert json.loads(request.content) == {"chat_id": 12345, "action": "typing"}


def test_si_falla_el_indicador_de_escritura_solo_se_registra(telegram, canal, caplog):
    telegram["status"] = 500

    asyncio.run(canal.enviar_escribiendo("12345"))

    assert "No se pudo enviar el indicador de escritura" in caplog.text


def test_sin_token_no_intenta_enviar(telegram, canal, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_TOKEN", "")

    asyncio.run(canal.enviar_mensaje("12345", "Hola"))
    asyncio.run(canal.enviar_escribiendo("12345"))

    assert telegram["requests"] == []


def test_reutiliza_la_conexion_dentro_del_mismo_event_loop():
    canal = TelegramChannel()

    async def dos_pedidos():
        return canal._cliente(), canal._cliente()

    primero, segundo = asyncio.run(dos_pedidos())

    assert primero is segundo
    # En otro event loop se crea una conexión nueva (una conexión no se puede compartir entre loops).
    assert asyncio.run(dos_pedidos())[0] is not primero


def test_enviar_mensaje_por_canal_usa_el_canal_indicado(telegram):
    asyncio.run(enviar_mensaje("telegram", "12345", "Hola"))

    assert len(telegram["requests"]) == 1


def test_enviar_mensaje_sin_canal_o_chat_no_envia(telegram, caplog):
    asyncio.run(enviar_mensaje(None, "12345", "Hola"))
    asyncio.run(enviar_mensaje("telegram", None, "Hola"))

    assert telegram["requests"] == []
