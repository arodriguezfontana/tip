"""Derivación de la conversación a un empleado: el bot calla, el empleado atiende y el bot retoma."""

import asyncio
from datetime import datetime, time
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.core.channels import Channel
from app.core.config import settings
from app.core.time import RESTAURANT_TZ
from app.services.bot_service import BotService
from app.services.business_hours_service import Franja, guardar_franjas
from app.services.chat_memory import SesionChat
from app.services.chat_service import ChatService
from app.services.human_handoff import MENSAJE_DERIVACION, MENSAJE_FIN_DERIVACION, derivaciones
from tests.conftest import TestingSessionLocal

CHAT = "telegram:12345"


@pytest.fixture(autouse=True)
def registro_limpio():
    derivaciones._por_chat.clear()
    yield
    derivaciones._por_chat.clear()


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.handoff_tools.SessionLocal", TestingSessionLocal):
        yield


@pytest.fixture()
def telegram():
    with patch("app.api.handoff_router.enviar_mensaje", new=AsyncMock()) as mock:
        yield mock


class FakeLLM:
    def __init__(self, respuestas):
        self.respuestas = list(respuestas)

    def bind_tools(self, _herramientas):
        return self

    async def ainvoke(self, _mensajes):
        return self.respuestas.pop(0)


def test_el_bot_deriva_cuando_el_cliente_pide_una_persona():
    llm = FakeLLM(
        [AIMessage(content="", tool_calls=[{"name": "derivar_a_empleado", "args": {"motivo": "Quiere un asesor"}, "id": "c1"}])]
    )

    respuesta = asyncio.run(ChatService(llm=llm).obtener_respuesta("pasame con una persona", session_id=CHAT))

    assert respuesta == MENSAJE_DERIVACION
    [derivacion] = derivaciones.listar()
    assert derivacion.chat_id == CHAT
    assert derivacion.motivo == "Quiere un asesor"
    assert derivacion.estado == "waiting"


def _pedir_empleado(momento: datetime | None = None) -> str:
    llm = FakeLLM([AIMessage(content="", tool_calls=[{"name": "derivar_a_empleado", "args": {}, "id": "c1"}])])
    with patch("app.services.business_hours_service.ahora_local", return_value=momento or datetime.now(RESTAURANT_TZ)):
        return asyncio.run(ChatService(llm=llm).obtener_respuesta("quiero una persona", session_id=CHAT))


@pytest.fixture()
def lunes_de_12_a_15(db_session):
    # Lunes 28/09/2026.
    guardar_franjas(db_session, [Franja(dia=0, apertura=time(12), cierre=time(15))])


def test_con_el_local_cerrado_no_deriva_y_avisa(lunes_de_12_a_15):
    respuesta = _pedir_empleado(datetime(2026, 9, 28, 21, 0, tzinfo=RESTAURANT_TZ))

    assert "cerrado" in respuesta
    assert "Volvemos a abrir" in respuesta
    assert derivaciones.listar() == []


def test_con_el_local_abierto_deriva(lunes_de_12_a_15):
    respuesta = _pedir_empleado(datetime(2026, 9, 28, 13, 0, tzinfo=RESTAURANT_TZ))

    assert respuesta == MENSAJE_DERIVACION
    assert len(derivaciones.listar()) == 1


def test_desde_la_web_de_prueba_no_se_puede_derivar():
    llm = FakeLLM([AIMessage(content="", tool_calls=[{"name": "derivar_a_empleado", "args": {}, "id": "c1"}])])

    asyncio.run(ChatService(llm=llm).obtener_respuesta("un asesor", session_id="no-es-telegram"))

    assert derivaciones.listar() == []


def test_con_una_derivacion_activa_el_bot_no_responde_y_el_mensaje_llega_al_empleado():
    derivaciones.solicitar(CHAT, cliente="Ana")
    servicio = BotService()

    with patch.object(servicio.agrupador, "recibir") as agrupador:
        servicio.recibir_mensaje(Channel.TELEGRAM, "12345", "¿Tienen sillas para bebé?")
        servicio.recibir_mensaje(Channel.TELEGRAM, "999", "Hola")
        servicio.recibir_mensaje(Channel.WHATSAPP, "12345", "Hola, soy de WhatsApp")

    assert [c.args for c in agrupador.call_args_list] == [
        ("telegram:999", "Hola"),
        ("whatsapp:12345", "Hola, soy de WhatsApp"),
    ]
    [derivacion] = derivaciones.listar()
    assert [(m.autor, m.texto) for m in derivacion.mensajes] == [("customer", "¿Tienen sillas para bebé?")]


def test_requiere_ser_administrador(public_client, customer_headers):
    assert public_client.get("/api/v1/handoffs").status_code == 401
    assert public_client.get("/api/v1/handoffs", headers=customer_headers).status_code == 403


def test_flujo_completo_del_empleado(client, telegram):
    derivacion = derivaciones.solicitar(CHAT, cliente="Ana", motivo="Quiere hacer una reserva")

    [item] = client.get("/api/v1/handoffs").json()
    assert (item["id"], item["customer_name"], item["status"]) == (derivacion.id, "Ana", "waiting")

    tomada = client.post(f"/api/v1/handoffs/{derivacion.id}/take").json()
    assert tomada["status"] == "in_progress"
    assert tomada["handled_by"] == "empleado@test.com"

    derivaciones.registrar_mensaje_del_cliente(CHAT, "Hola, ¿hay mesa?")
    enviado = client.post(f"/api/v1/handoffs/{derivacion.id}/messages", json={"text": "  Sí, te esperamos  "})
    assert enviado.status_code == 200
    telegram.assert_awaited_with(Channel.TELEGRAM, "12345", "Sí, te esperamos")
    assert [(m["author"], m["text"]) for m in enviado.json()["messages"]] == [
        ("system", "empleado@test.com tomó la conversación."),
        ("customer", "Hola, ¿hay mesa?"),
        ("employee", "Sí, te esperamos"),
    ]

    assert client.post(f"/api/v1/handoffs/{derivacion.id}/finish").status_code == 204
    telegram.assert_awaited_with(Channel.TELEGRAM, "12345", MENSAJE_FIN_DERIVACION)
    assert client.get("/api/v1/handoffs").json() == []
    assert not derivaciones.esta_derivado(CHAT)


def test_no_se_puede_enviar_un_mensaje_vacio(client, telegram):
    derivacion = derivaciones.solicitar(CHAT)

    assert client.post(f"/api/v1/handoffs/{derivacion.id}/messages", json={"text": "   "}).status_code == 422
    telegram.assert_not_awaited()


def test_otro_empleado_no_puede_quitarle_la_conversacion(client, telegram):
    derivacion = derivaciones.solicitar(CHAT)
    derivaciones.tomar(derivacion.id, "otro@test.com")

    assert client.post(f"/api/v1/handoffs/{derivacion.id}/take").status_code == 409
    assert client.post(f"/api/v1/handoffs/{derivacion.id}/messages", json={"text": "hola"}).status_code == 409
    assert client.post(f"/api/v1/handoffs/{derivacion.id}/finish").status_code == 409
    telegram.assert_not_awaited()


def test_derivacion_inexistente(client, telegram):
    assert client.get("/api/v1/handoffs/99").status_code == 404
    assert client.post("/api/v1/handoffs/99/take").status_code == 404


def test_pedir_dos_veces_no_duplica_la_derivacion():
    primera = derivaciones.solicitar(CHAT, cliente="Ana")
    segunda = derivaciones.solicitar(CHAT, cliente="Otro")

    assert primera is segunda
    assert len(derivaciones.listar()) == 1


def test_el_empleado_recibe_toda_la_charla_previa_con_el_bot():
    llm = FakeLLM(
        [
            AIMessage(content="¡Hola! ¿Querés ver el menú?"),
            AIMessage(content="", tool_calls=[{"name": "derivar_a_empleado", "args": {"motivo": "Prefiere una persona"}, "id": "c1"}]),
        ]
    )
    servicio = ChatService(llm=llm)

    asyncio.run(servicio.obtener_respuesta("Hola", session_id=CHAT))
    assert derivaciones.listar() == []
    asyncio.run(servicio.obtener_respuesta("pasame con una persona", session_id=CHAT))

    [derivacion] = derivaciones.listar()
    assert [(m.autor, m.texto) for m in derivacion.mensajes] == [
        ("customer", "Hola"),
        ("bot", "¡Hola! ¿Querés ver el menú?"),
        ("customer", "pasame con una persona"),
        ("bot", MENSAJE_DERIVACION),
        ("system", "El cliente pidió hablar con una persona."),
    ]
    assert derivacion.sin_leer == 0


def test_el_historial_se_adjunta_una_sola_vez():
    derivacion = derivaciones.solicitar(CHAT)
    sesion = ChatService(llm=FakeLLM([])).sesiones.setdefault(CHAT, SesionChat())
    sesion.iniciar_turno("Hola")

    derivaciones.adjuntar_historial(CHAT, sesion.transcripcion)
    derivaciones.adjuntar_historial(CHAT, sesion.transcripcion)

    assert [m.autor for m in derivacion.mensajes] == ["customer", "system"]


def test_mensajes_sin_leer(client, telegram):
    derivacion = derivaciones.solicitar(CHAT)
    derivaciones.tomar(derivacion.id, "empleado@test.com")

    derivaciones.registrar_mensaje_del_cliente(CHAT, "uno")
    derivaciones.registrar_mensaje_del_cliente(CHAT, "dos")
    [item] = client.get("/api/v1/handoffs").json()
    assert item["unread_count"] == 2
    assert item["last_message"]["text"] == "dos"

    # Abrir el chat (consultar su detalle) los marca como leídos.
    assert client.get(f"/api/v1/handoffs/{derivacion.id}").json()["unread_count"] == 0
    assert client.get("/api/v1/handoffs").json()[0]["unread_count"] == 0


def test_identifica_al_cliente_con_su_perfil_de_telegram_y_el_telefono_que_dio():
    llm = FakeLLM([AIMessage(content="", tool_calls=[{"name": "derivar_a_empleado", "args": {}, "id": "c1"}])])
    servicio = ChatService(llm=llm)
    sesion = servicio.sesiones.setdefault(CHAT, SesionChat())
    sesion.perfil = {"nombre": "Ana Pérez", "usuario": "anita"}
    sesion.cliente = {"telefono": "1155551234"}

    asyncio.run(servicio.obtener_respuesta("quiero una persona", session_id=CHAT))

    [derivacion] = derivaciones.listar()
    assert (derivacion.cliente, derivacion.usuario, derivacion.telefono) == ("Ana Pérez", "anita", "1155551234")


def test_el_nombre_que_dio_al_bot_tiene_prioridad_sobre_el_de_telegram():
    llm = FakeLLM([AIMessage(content="", tool_calls=[{"name": "derivar_a_empleado", "args": {}, "id": "c1"}])])
    servicio = ChatService(llm=llm)
    sesion = servicio.sesiones.setdefault(CHAT, SesionChat())
    sesion.perfil = {"nombre": "anita_92"}
    sesion.cliente = {"nombre": "Ana Pérez"}

    asyncio.run(servicio.obtener_respuesta("quiero una persona", session_id=CHAT))

    assert derivaciones.listar()[0].cliente == "Ana Pérez"


def test_el_webhook_guarda_el_perfil_de_quien_escribe(public_client):
    from app.services.bot_service import bot_service

    update = {
        "update_id": 1,
        "message": {
            "message_id": 7,
            "chat": {"id": 555},
            "text": "Hola",
            "from": {"first_name": "Ana", "last_name": "Pérez", "username": "anita"},
        },
    }
    try:
        with patch.object(bot_service, "recibir_mensaje"):
            public_client.post(
                "/api/v1/telegram/webhook",
                json=update,
                headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
            )
        assert bot_service.chat_service.sesiones["telegram:555"].perfil == {"nombre": "Ana Pérez", "usuario": "anita"}
    finally:
        bot_service.chat_service.sesiones.pop("telegram:555", None)
