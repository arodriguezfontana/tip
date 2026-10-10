"""Cómo responde el bot cuando Gemini o las herramientas se comportan mal."""

import asyncio
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from app.services import chat_service as chat_service_module
from app.services.chat_service import MENSAJE_FALLBACK_LOOP, ChatService
from tests.conftest import TestingSessionLocal

SESSION = "12345"


class FakeLLM:
    def __init__(self, respuestas=None, error=None, demora=0.0):
        self.respuestas = list(respuestas or [])
        self.error = error
        self.demora = demora
        self.llamadas = 0

    def bind_tools(self, _herramientas):
        return self

    async def ainvoke(self, _mensajes):
        self.llamadas += 1
        if self.demora:
            await asyncio.sleep(self.demora)
        if self.error:
            raise self.error
        return self.respuestas.pop(0)


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.menu_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.horario_tools.SessionLocal", TestingSessionLocal):
        yield


def _tool_call(nombre, args, call_id="c1"):
    return AIMessage(content="", tool_calls=[{"name": nombre, "args": args, "id": call_id}])


def _conversar(llm, mensaje="Hola"):
    servicio = ChatService(llm=llm)
    return servicio, asyncio.run(servicio.obtener_respuesta(mensaje, session_id=SESSION))


def test_respuesta_en_partes_se_une_en_un_solo_texto():
    llm = FakeLLM([AIMessage(content=[{"type": "text", "text": "¡Hola! "}, {"type": "text", "text": "¿Qué querés pedir?"}])])

    _, respuesta = _conversar(llm)

    assert respuesta == "¡Hola! ¿Qué querés pedir?"


def test_respuesta_vacia_pide_que_repita():
    _, respuesta = _conversar(FakeLLM([AIMessage(content="   ")]))

    assert "¿Podrías repetirme?" in respuesta


def test_herramienta_inexistente_no_rompe_la_conversacion():
    llm = FakeLLM([_tool_call("borrar_base_de_datos", {}), AIMessage(content="No puedo hacer eso")])

    servicio, respuesta = _conversar(llm)

    assert respuesta == "No puedo hacer eso"
    tool_messages = [m for m in servicio.sesiones[SESSION].historial if isinstance(m, ToolMessage)]
    assert tool_messages[0].content == "Herramienta desconocida: borrar_base_de_datos"


def test_error_en_una_herramienta_se_le_informa_al_modelo():
    llm = FakeLLM([
        _tool_call("calcular_y_preparar_pedido", {"items_solicitados": "1 Pizza"}),
        AIMessage(content="Tuve un problema, ¿me repetís el pedido?"),
    ])

    class HerramientaRota:
        name = "calcular_y_preparar_pedido"

        async def ainvoke(self, _args):
            raise RuntimeError("base caída")

    servicio = ChatService(llm=llm)
    servicio.herramientas_por_nombre["calcular_y_preparar_pedido"] = HerramientaRota()
    respuesta = asyncio.run(servicio.obtener_respuesta("Quiero una pizza", session_id=SESSION))

    assert respuesta == "Tuve un problema, ¿me repetís el pedido?"
    [tool_message] = [m for m in servicio.sesiones[SESSION].historial if isinstance(m, ToolMessage)]
    assert tool_message.content == "Ocurrió un error consultando la información."


def test_si_el_modelo_se_queda_llamando_herramientas_corta_y_avisa(monkeypatch):
    monkeypatch.setattr(chat_service_module, "MAX_TOOL_ITERATIONS", 3)
    llm = FakeLLM([_tool_call("herramienta_rara", {}, f"c{i}") for i in range(3)])

    _, respuesta = _conversar(llm)

    assert respuesta == MENSAJE_FALLBACK_LOOP
    assert llm.llamadas == 3


def test_si_gemini_tarda_demasiado_responde_el_mensaje_de_espera(monkeypatch):
    monkeypatch.setattr(chat_service_module, "LLM_TIMEOUT_SECONDS", 0.05)

    _, respuesta = _conversar(FakeLLM([AIMessage(content="tarde")], demora=1))

    assert respuesta == MENSAJE_FALLBACK_LOOP


def test_el_turno_se_cierra_aunque_gemini_falle():
    """Un error de la API no debe dejar la sesión a medio turno (lo maneja quien llama, con el fallback)."""
    llm = FakeLLM(error=RuntimeError("503 de Gemini"))
    servicio = ChatService(llm=llm)

    with pytest.raises(RuntimeError):
        asyncio.run(servicio.obtener_respuesta("Hola", session_id=SESSION))

    llm.error = None
    llm.respuestas = [AIMessage(content="¡Hola de nuevo!")]
    assert asyncio.run(servicio.obtener_respuesta("Hola", session_id=SESSION)) == "¡Hola de nuevo!"


def test_cada_chat_tiene_su_propia_memoria():
    llm = FakeLLM([AIMessage(content="a"), AIMessage(content="b")])
    servicio = ChatService(llm=llm)

    asyncio.run(servicio.obtener_respuesta("Soy Ana", session_id="chat-1"))
    asyncio.run(servicio.obtener_respuesta("Soy Beto", session_id="chat-2"))

    assert [m.content for m in servicio.sesiones["chat-1"].historial] == ["Soy Ana", "a"]
    assert [m.content for m in servicio.sesiones["chat-2"].historial] == ["Soy Beto", "b"]
