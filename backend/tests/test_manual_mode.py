"""US-45: intervención manual de un empleado y pausa automática del bot."""

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.core.channels import Channel
from app.core.config import settings
from app.models.order import Order
from app.services import human_handoff
from app.services.bot_service import BotService, bot_service
from app.services.chat_memory import SesionChat
from app.services.human_handoff import EMPLEADO_EXTERNO, derivaciones

CHAT = "whatsapp:5491155551234"
APP_SECRET = "secreto-de-la-app"


@pytest.fixture(autouse=True)
def registro_limpio():
    derivaciones._por_chat.clear()
    yield
    derivaciones._por_chat.clear()
    bot_service.chat_service.sesiones.pop(CHAT, None)


@pytest.fixture(autouse=True)
def whatsapp(monkeypatch):
    monkeypatch.setattr(settings, "BOT_CHANNELS", "telegram,whatsapp")
    monkeypatch.setattr(settings, "WHATSAPP_APP_SECRET", APP_SECRET)


@pytest.fixture()
def enviar():
    with patch("app.api.handoff_router.enviar_mensaje", new=AsyncMock()) as mock:
        yield mock


def _pedido(db_session, channel="whatsapp", chat_id="5491155551234") -> Order:
    order = Order(
        customer_name="Ana",
        shipping_address="Calle 1",
        total_amount=1000.0,
        status="Pendiente",
        delivery_method="domicilio",
        source="bot",
        channel=channel,
        chat_id=chat_id,
        customer_phone="5491155551234",
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def _eco(texto="Hola, soy del local", destino="5491155551234"):
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA",
                "changes": [
                    {
                        "field": "smb_message_echoes",
                        "value": {
                            "messaging_product": "whatsapp",
                            "message_echoes": [
                                {"from": "5491100000000", "to": destino, "id": "wamid.X", "type": "text", "text": {"body": texto}}
                            ],
                        },
                    }
                ],
            }
        ],
    }


def _post(client, payload):
    cuerpo = json.dumps(payload).encode()
    firma = "sha256=" + hmac.new(APP_SECRET.encode(), cuerpo, hashlib.sha256).hexdigest()
    return client.post(
        "/api/v1/whatsapp/webhook", content=cuerpo, headers={"Content-Type": "application/json", "X-Hub-Signature-256": firma}
    )


# --- Trigger desde el panel ---


def test_el_pedido_del_bot_indica_que_tiene_chat(client, db_session):
    order = _pedido(db_session)

    assert client.get(f"/api/v1/orders/{order.id}").json()["has_chat"] is True


def test_un_pedido_sin_chat_no_tiene_acceso_al_chat(client, db_session):
    order = _pedido(db_session, channel=None, chat_id=None)

    assert client.get(f"/api/v1/orders/{order.id}").json()["has_chat"] is False
    assert client.get(f"/api/v1/handoffs/by-order/{order.id}").status_code == 400


def test_abrir_el_chat_del_pedido_no_pausa_al_bot(client, db_session):
    order = _pedido(db_session)
    sesion = bot_service.chat_service.sesiones.setdefault(CHAT, SesionChat())
    sesion.iniciar_turno("Hola")

    chat = client.get(f"/api/v1/handoffs/by-order/{order.id}").json()

    assert chat["status"] == "bot"
    assert [m["text"] for m in chat["messages"]] == ["Hola"]
    assert not derivaciones.esta_derivado(CHAT)


def test_responder_desde_el_panel_pausa_al_bot(client, db_session, enviar):
    order = _pedido(db_session)
    sesion = bot_service.chat_service.sesiones.setdefault(CHAT, SesionChat())
    sesion.iniciar_turno("Hola")

    respuesta = client.post(f"/api/v1/handoffs/by-order/{order.id}/messages", json={"text": "  ¿Todo bien con el pedido?  "})

    assert respuesta.status_code == 200
    enviar.assert_awaited_with(Channel.WHATSAPP, "5491155551234", "¿Todo bien con el pedido?")
    datos = respuesta.json()
    assert datos["status"] == "in_progress"
    assert datos["handled_by"] == "empleado@test.com"
    assert datos["expires_at"] is not None
    assert [(m["author"], m["text"]) for m in datos["messages"] if m["author"] != "system"] == [
        ("customer", "Hola"),
        ("employee", "¿Todo bien con el pedido?"),
    ]
    assert derivaciones.esta_derivado(CHAT)


def test_otro_empleado_no_puede_intervenir_un_chat_ya_intervenido(client, db_session, enviar):
    order = _pedido(db_session)
    derivaciones.intervenir(CHAT, "otro@test.com")

    assert client.post(f"/api/v1/handoffs/by-order/{order.id}/messages", json={"text": "hola"}).status_code == 409
    enviar.assert_not_awaited()


# --- Trigger externo (Meta Business Suite) ---


def test_un_mensaje_saliente_desde_meta_pausa_al_bot(public_client):
    resultado = _post(public_client, _eco("Hola, soy del local"))

    assert resultado.status_code == 200
    [derivacion] = derivaciones.listar()
    assert derivacion.chat_id == CHAT
    assert derivacion.atendida_por == EMPLEADO_EXTERNO
    assert [(m.autor, m.texto) for m in derivacion.mensajes if m.autor != "system"] == [("employee", "Hola, soy del local")]


def test_el_eco_de_un_celular_argentino_se_asocia_al_chat_del_cliente(public_client):
    # Meta lo informa como 54... y el chat del cliente es 549...
    _post(public_client, _eco(destino="541155551234"))

    assert derivaciones.esta_derivado(CHAT)


def test_el_eco_conserva_la_charla_previa_con_el_bot(public_client):
    bot_service.chat_service.sesiones.setdefault(CHAT, SesionChat()).iniciar_turno("Hola")

    _post(public_client, _eco())

    [derivacion] = derivaciones.listar()
    assert derivacion.mensajes[0].texto == "Hola"


def test_un_empleado_del_panel_puede_tomar_lo_que_atiende_meta(client, public_client):
    _post(public_client, _eco())
    [derivacion] = derivaciones.listar()

    [item] = client.get("/api/v1/handoffs").json()
    assert item["external"] is True

    tomada = client.post(f"/api/v1/handoffs/{derivacion.id}/take").json()
    assert (tomada["handled_by"], tomada["external"]) == ("empleado@test.com", False)


# --- Suspensión del motor NLP ---


def test_en_modo_manual_los_mensajes_se_guardan_y_no_llegan_a_la_ia():
    derivaciones.intervenir(CHAT, "empleado@test.com")
    servicio = BotService()

    with patch.object(servicio.agrupador, "recibir") as agrupador:
        servicio.recibir_mensaje(Channel.WHATSAPP, "5491155551234", "¿Y mi pedido?")

    agrupador.assert_not_called()
    [derivacion] = derivaciones.listar()
    assert [(m.autor, m.texto) for m in derivacion.mensajes if m.autor == "customer"] == [("customer", "¿Y mi pedido?")]


def test_un_mensaje_en_cola_cuando_el_empleado_interviene_no_se_responde():
    derivaciones.intervenir(CHAT, "empleado@test.com")
    servicio = BotService()

    with patch.object(servicio.chat_service, "obtener_respuesta", new=AsyncMock()) as ia:
        asyncio.run(servicio.procesar_y_enviar(CHAT, "mensaje que esperaba en la cola"))

    ia.assert_not_awaited()
    assert derivaciones.listar()[0].mensajes[-1].texto == "mensaje que esperaba en la cola"


# --- Reactivación automática ---


def _envejecer(derivacion, minutos):
    derivacion.ultima_actividad = datetime.now(timezone.utc) - timedelta(minutes=minutos)


def test_pasados_10_minutos_sin_mensajes_vuelve_el_bot():
    derivacion = derivaciones.intervenir(CHAT, "empleado@test.com")

    _envejecer(derivacion, 11)

    assert not derivaciones.esta_derivado(CHAT)
    assert derivaciones.listar() == []


def test_antes_de_los_10_minutos_sigue_pausado():
    derivacion = derivaciones.intervenir(CHAT, "empleado@test.com")

    _envejecer(derivacion, 9)

    assert derivaciones.esta_derivado(CHAT)


def test_un_mensaje_del_cliente_reinicia_el_temporizador():
    derivacion = derivaciones.intervenir(CHAT, "empleado@test.com")
    _envejecer(derivacion, 9)

    derivaciones.registrar_mensaje_del_cliente(CHAT, "sigo acá")

    assert (datetime.now(timezone.utc) - derivacion.ultima_actividad) < timedelta(seconds=5)
    assert derivaciones.esta_derivado(CHAT)


def test_un_mensaje_del_empleado_reinicia_el_temporizador():
    derivacion = derivaciones.intervenir(CHAT, "empleado@test.com")
    _envejecer(derivacion, 9)

    derivaciones.registrar_respuesta(derivacion.id, "empleado@test.com", "ya te cuento")

    assert (datetime.now(timezone.utc) - derivacion.ultima_actividad) < timedelta(seconds=5)


def test_los_avisos_del_sistema_no_reinician_el_temporizador():
    derivacion = derivaciones.intervenir(CHAT, "empleado@test.com")
    _envejecer(derivacion, 9)
    antes = derivacion.ultima_actividad

    derivacion.agregar(human_handoff.AutorMensaje.SISTEMA, "aviso")

    assert derivacion.ultima_actividad == antes


def test_el_tiempo_limite_es_configurable(monkeypatch):
    monkeypatch.setattr(settings, "MANUAL_MODE_TIMEOUT_SECONDS", 60)
    derivacion = derivaciones.intervenir(CHAT, "empleado@test.com")

    _envejecer(derivacion, 2)

    assert not derivaciones.esta_derivado(CHAT)


# --- Reactivación manual ---


def test_cerrar_la_atencion_devuelve_el_bot_al_instante(client, db_session, enviar):
    order = _pedido(db_session)
    client.post(f"/api/v1/handoffs/by-order/{order.id}/messages", json={"text": "hola"})
    [item] = client.get("/api/v1/handoffs").json()

    assert client.post(f"/api/v1/handoffs/{item['id']}/finish").status_code == 204
    assert not derivaciones.esta_derivado(CHAT)
    assert client.get(f"/api/v1/handoffs/by-order/{order.id}").json()["status"] == "bot"
