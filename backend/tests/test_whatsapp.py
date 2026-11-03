"""Canal de WhatsApp (Cloud API de Meta): webhook entrante, envíos y configuración."""

import asyncio
import hashlib
import hmac
import json
from unittest.mock import patch

import httpx
import pytest
from pydantic import ValidationError

from app.core.channels import Channel, session_key, split_session_key
from app.core.config import Settings, settings
from app.services.channels import obtener_canal
from app.services.channels.whatsapp import WhatsAppChannel

WEBHOOK_URL = "/api/v1/whatsapp/webhook"
APP_SECRET = "secreto-de-la-app"
VERIFY_TOKEN = "token-de-verificacion"


@pytest.fixture(autouse=True)
def whatsapp_habilitado(monkeypatch):
    monkeypatch.setattr(settings, "BOT_CHANNELS", "telegram,whatsapp")
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", APP_SECRET)
    monkeypatch.setattr(settings, "WHATSAPP_VERIFY_TOKEN", VERIFY_TOKEN)
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "token-de-acceso")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "1029384756")


def _notificacion(texto="Hola", telefono="5491155551234", nombre="Ana", message_id="wamid.ABC"):
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "contacts": [{"profile": {"name": nombre}, "wa_id": telefono}],
                            "messages": [
                                {"from": telefono, "id": message_id, "type": "text", "text": {"body": texto}}
                            ],
                        },
                    }
                ],
            }
        ],
    }


def _post(client, payload, firma=True):
    cuerpo = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if firma:
        headers["X-Hub-Signature-256"] = "sha256=" + hmac.new(APP_SECRET.encode(), cuerpo, hashlib.sha256).hexdigest()
    return client.post(WEBHOOK_URL, content=cuerpo, headers=headers)


@pytest.fixture()
def bot():
    with patch("app.api.whatsapp_router.bot_service") as mock:
        yield mock


# --- Verificación inicial del webhook (GET) ---


def test_meta_verifica_el_webhook_y_recibe_el_challenge(public_client):
    response = public_client.get(
        WEBHOOK_URL, params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444"}
    )

    assert response.status_code == 200
    assert response.text == "1158201444"


def test_la_verificacion_con_otro_token_se_rechaza(public_client):
    response = public_client.get(
        WEBHOOK_URL, params={"hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1"}
    )

    assert response.status_code == 403


# --- Mensajes entrantes (POST) ---


def test_un_mensaje_de_texto_se_encola_con_el_telefono_como_chat(public_client, bot):
    response = _post(public_client, _notificacion("Quiero una muzza"))

    assert response.status_code == 200
    bot.recibir_mensaje.assert_called_once_with(Channel.WHATSAPP, "5491155551234", "Quiero una muzza")
    bot.registrar_perfil.assert_called_once_with(Channel.WHATSAPP, "5491155551234", "Ana", telefono="5491155551234")


def test_recuerda_el_ultimo_mensaje_para_mostrar_escribiendo(public_client, bot):
    _post(public_client, _notificacion(message_id="wamid.XYZ"))

    assert obtener_canal(Channel.WHATSAPP)._ultimo_mensaje_recibido["5491155551234"] == "wamid.XYZ"


def test_sin_firma_o_con_firma_incorrecta_se_rechaza(public_client, bot):
    assert _post(public_client, _notificacion(), firma=False).status_code == 403

    cuerpo = json.dumps(_notificacion()).encode()
    response = public_client.post(WEBHOOK_URL, content=cuerpo, headers={"X-Hub-Signature-256": "sha256=00"})

    assert response.status_code == 403
    bot.recibir_mensaje.assert_not_called()


@pytest.mark.parametrize(
    "payload",
    [
        # Avisos de entrega/lectura de mensajes que mandamos nosotros.
        {"entry": [{"changes": [{"value": {"statuses": [{"id": "wamid.1", "status": "delivered"}]}}]}]},
        # Mensajes que no son texto (imagen, audio, ubicación...).
        {"entry": [{"changes": [{"value": {"messages": [{"from": "549", "id": "w", "type": "image"}]}}]}]},
        {"entry": []},
        {},
    ],
)
def test_lo_que_no_es_texto_se_ignora_pero_se_confirma(public_client, bot, payload):
    """Meta reintenta lo que no se confirma con 200: siempre hay que responder 200."""
    response = _post(public_client, payload)

    assert response.status_code == 200
    bot.recibir_mensaje.assert_not_called()


def test_con_whatsapp_deshabilitado_el_webhook_no_existe(public_client, bot, monkeypatch):
    monkeypatch.setattr(settings, "BOT_CHANNELS", "telegram")

    assert _post(public_client, _notificacion()).status_code == 404
    assert public_client.get(WEBHOOK_URL).status_code == 404
    bot.recibir_mensaje.assert_not_called()


# --- Envíos a la API de Meta ---


@pytest.fixture()
def meta(monkeypatch):
    canal = WhatsAppChannel()
    estado = {"status": 200, "requests": []}

    def responder(request: httpx.Request) -> httpx.Response:
        estado["requests"].append(request)
        return httpx.Response(estado["status"], json={})

    monkeypatch.setattr(canal, "_cliente", lambda: httpx.AsyncClient(transport=httpx.MockTransport(responder)))
    estado["canal"] = canal
    return estado


def test_envia_el_mensaje_de_texto(meta):
    asyncio.run(meta["canal"].enviar_mensaje("5491155551234", "¡Tu pedido está en camino!"))

    [request] = meta["requests"]
    assert request.url == f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/1029384756/messages"
    assert request.headers["Authorization"] == "Bearer token-de-acceso"
    assert json.loads(request.content) == {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": "541155551234",  # sin el 9 de los celulares argentinos (ver _destinatario)
        "type": "text",
        "text": {"body": "¡Tu pedido está en camino!"},
    }


def test_los_celulares_argentinos_se_envian_sin_el_9(meta):
    asyncio.run(meta["canal"].enviar_mensaje("5491162939338", "Hola"))
    asyncio.run(meta["canal"].enviar_mensaje("5511987654321", "Oi"))

    destinos = [json.loads(r.content)["to"] for r in meta["requests"]]
    assert destinos == ["541162939338", "5511987654321"]


def test_un_error_de_meta_no_rompe_el_flujo(meta, caplog):
    meta["status"] = 400

    asyncio.run(meta["canal"].enviar_mensaje("5491155551234", "Hola"))

    assert "Error al enviar mensaje a WhatsApp" in caplog.text


def test_indicador_de_escritura_responde_al_ultimo_mensaje_del_cliente(meta):
    canal = meta["canal"]
    canal.recordar_mensaje_recibido("5491155551234", "wamid.ABC")

    asyncio.run(canal.enviar_escribiendo("5491155551234"))

    [request] = meta["requests"]
    assert json.loads(request.content) == {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": "wamid.ABC",
        "typing_indicator": {"type": "text"},
    }


def test_sin_mensaje_recibido_no_hay_indicador_de_escritura(meta):
    asyncio.run(meta["canal"].enviar_escribiendo("5491155551234"))

    assert meta["requests"] == []


def test_sin_credenciales_no_intenta_enviar(meta, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "")

    asyncio.run(meta["canal"].enviar_mensaje("5491155551234", "Hola"))

    assert meta["requests"] == []


def test_recuerda_solo_los_ultimos_chats(monkeypatch):
    monkeypatch.setattr("app.services.channels.whatsapp.MAX_MENSAJES_RECORDADOS", 2)
    canal = WhatsAppChannel()

    for n in range(3):
        canal.recordar_mensaje_recibido(f"chat{n}", f"wamid.{n}")

    assert list(canal._ultimo_mensaje_recibido) == ["chat1", "chat2"]


# --- Configuración y claves de conversación ---

_BASE = {
    "GOOGLE_API_KEY": "g",
    "JWT_SECRET_KEY": "j",
    "ADMIN_EMAIL": "a@a.com",
    "ADMIN_PASSWORD": "p",
    "TELEGRAM_TOKEN": "t",
}


def _configuracion(**extra) -> Settings:
    return Settings(_env_file=None, **{**_BASE, **extra})


def test_whatsapp_habilitado_exige_sus_credenciales():
    with pytest.raises(ValidationError, match="WHATSAPP_ACCESS_TOKEN"):
        _configuracion(BOT_CHANNELS="whatsapp")


def test_se_puede_usar_solo_whatsapp_sin_token_de_telegram():
    config = _configuracion(
        BOT_CHANNELS="whatsapp",
        TELEGRAM_TOKEN="",
        WHATSAPP_ACCESS_TOKEN="a",
        WHATSAPP_PHONE_NUMBER_ID="1",
        WHATSAPP_VERIFY_TOKEN="v",
        WHATSAPP_APP_SECRET="s",
    )

    assert config.canales_habilitados == {Channel.WHATSAPP}


def test_por_defecto_solo_telegram():
    assert _configuracion().canales_habilitados == {Channel.TELEGRAM}


def test_un_canal_desconocido_en_la_configuracion_se_rechaza():
    with pytest.raises(ValidationError):
        _configuracion(BOT_CHANNELS="telegram,signal")


def test_clave_de_conversacion_distingue_el_canal():
    assert session_key(Channel.WHATSAPP, "123") != session_key(Channel.TELEGRAM, "123")
    assert split_session_key("whatsapp:123") == (Channel.WHATSAPP, "123")
    assert split_session_key("telegram:-100123") == (Channel.TELEGRAM, "-100123")
    # La sesión de prueba del panel no pertenece a ningún canal.
    assert split_session_key("b0f4c9e2-uuid") == (None, "b0f4c9e2-uuid")
