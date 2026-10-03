import asyncio
import json
from datetime import timedelta
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.modules.order import Order
from app.services import chat_memory
from app.services.chat_service import ChatService
from tests.conftest import TestingSessionLocal

SESSION = "12345"


class FakeLLM:
    """Devuelve respuestas guionadas y guarda los mensajes que recibió en cada llamada."""

    def __init__(self):
        self.respuestas: list[AIMessage] = []
        self.llamadas: list[list] = []

    def bind_tools(self, _herramientas):
        return self

    async def ainvoke(self, mensajes):
        self.llamadas.append(list(mensajes))
        return self.respuestas.pop(0)


def _texto(respuesta: str) -> AIMessage:
    return AIMessage(content=respuesta)


def _tool_call(nombre: str, args: dict, call_id: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": nombre, "args": args, "id": call_id}])


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.menu_tools.SessionLocal", TestingSessionLocal):
        yield


@pytest.fixture()
def bot():
    llm = FakeLLM()
    return ChatService(llm=llm), llm


def _conversar(servicio: ChatService, mensaje: str) -> str:
    return asyncio.run(servicio.obtener_respuesta(mensaje, session_id=SESSION))


def _pedido_args(**extra):
    return {
        "items_solicitados": "1 Pizza Muzzarella",
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "metodo_entrega": "domicilio",
        "shipping_address": "Belgrano 95",
        **extra,
    }


def _armar_y_confirmar_pedido(servicio, llm):
    llm.respuestas = [_tool_call("calcular_y_preparar_pedido", _pedido_args(), "c1"), _texto("¿Están bien los datos?")]
    _conversar(servicio, "Quiero una muzza, soy Paula, 11 4444-5555, a Belgrano 95")

    datos = servicio.sesiones[SESSION].pedido_en_curso
    llm.respuestas = [_tool_call("confirmar_y_guardar_pedido", {"datos_pedido_json": json.dumps(datos)}, "c2")]
    return _conversar(servicio, "Sí")


def test_recuerda_datos_del_cliente_y_pedido_en_curso(bot, muzza):
    servicio, llm = bot
    llm.respuestas = [_tool_call("calcular_y_preparar_pedido", _pedido_args(), "c1"), _texto("¿Están bien los datos?")]

    _conversar(servicio, "Quiero una muzza")

    sesion = servicio.sesiones[SESSION]
    assert sesion.cliente == {"nombre": "Paula", "telefono": "11 4444-5555", "direccion": "Belgrano 95"}
    assert sesion.pedido_en_curso["items"][0]["nombre"] == "Pizza Muzzarella"

    llm.respuestas = [_texto("Perfecto")]
    _conversar(servicio, "¿Cuánto era?")
    prompt = llm.llamadas[-1][0].content
    assert "Teléfono: 11 4444-5555" in prompt
    assert "PEDIDO EN CURSO (1x Pizza Muzzarella)" in prompt


def test_al_registrar_el_pedido_olvida_la_charla_pero_no_al_cliente(bot, muzza, db_session):
    servicio, llm = bot
    _armar_y_confirmar_pedido(servicio, llm)

    assert db_session.query(Order).count() == 1
    sesion = servicio.sesiones[SESSION]
    assert sesion.pedido_en_curso is None
    assert "1x Pizza Muzzarella" in sesion.ultimo_pedido
    # Solo queda el último intercambio (el "Sí" y la registración), no la charla que armó el pedido.
    assert [m.content for m in sesion.historial if isinstance(m, HumanMessage)] == ["Sí"]

    llm.respuestas = [_texto("¡Hola de nuevo, Paula!")]
    _conversar(servicio, "Hola, quiero otro pedido")
    prompt = llm.llamadas[-1][0].content
    assert "Nombre: Paula" in prompt and "Dirección de envío: Belgrano 95" in prompt
    assert "ÚLTIMO PEDIDO DEL CLIENTE: 1x Pizza Muzzarella" in prompt
    assert "PEDIDO EN CURSO" not in prompt


def test_solo_manda_los_mensajes_recientes(bot):
    servicio, llm = bot
    for numero in range(20):
        llm.respuestas = [_texto(f"respuesta {numero}")]
        _conversar(servicio, f"mensaje {numero}")

    historial = servicio.sesiones[SESSION].historial
    assert len(historial) <= chat_memory.MAX_MENSAJES_HISTORIAL
    assert isinstance(historial[0], HumanMessage)
    assert historial[-1].content == "respuesta 19"
    assert all("mensaje 0" != m.content for m in llm.llamadas[-1])


def test_el_recorte_no_deja_resultados_de_herramientas_huerfanos(bot, muzza):
    servicio, llm = bot
    for numero in range(8):
        llm.respuestas = [
            _tool_call("calcular_y_preparar_pedido", _pedido_args(), f"m{numero}"),
            _texto("¿Están bien los datos?"),
        ]
        _conversar(servicio, f"pedido {numero}")

    historial = servicio.sesiones[SESSION].historial
    assert isinstance(historial[0], HumanMessage)
    ids_pedidos = {tc["id"] for m in historial if isinstance(m, AIMessage) for tc in m.tool_calls}
    assert all(m.tool_call_id in ids_pedidos for m in historial if isinstance(m, ToolMessage))


def test_tras_inactividad_olvida_la_charla_y_el_pedido_pero_no_al_cliente(bot, muzza):
    servicio, llm = bot
    llm.respuestas = [_tool_call("calcular_y_preparar_pedido", _pedido_args(), "c1"), _texto("¿Están bien los datos?")]
    _conversar(servicio, "Quiero una muzza")

    sesion = servicio.sesiones[SESSION]
    sesion.ultima_actividad -= chat_memory.INACTIVIDAD_PARA_REINICIAR + timedelta(minutes=1)

    llm.respuestas = [_texto("¡Hola!")]
    _conversar(servicio, "Hola")

    assert sesion.pedido_en_curso is None
    assert [m.content for m in sesion.historial if isinstance(m, HumanMessage)] == ["Hola"]
    assert sesion.cliente["nombre"] == "Paula"


def test_al_registrar_responde_el_mensaje_de_exito_sin_volver_a_llamar_a_gemini(bot, muzza):
    servicio, llm = bot
    llm.respuestas = [_tool_call("calcular_y_preparar_pedido", _pedido_args(), "c1"), _texto("¿Están bien los datos?")]
    _conversar(servicio, "Quiero una muzza")
    llamadas_antes = len(llm.llamadas)

    datos = servicio.sesiones[SESSION].pedido_en_curso
    llm.respuestas = [_tool_call("confirmar_y_guardar_pedido", {"datos_pedido_json": json.dumps(datos)}, "c2")]
    respuesta = _conversar(servicio, "Sí")

    assert len(llm.llamadas) == llamadas_antes + 1
    assert "Recibimos tu pedido" in respuesta
    assert "Todavía no está confirmado" in respuesta
    assert isinstance(servicio.sesiones[SESSION].historial[-1], AIMessage)


def test_el_resumen_completo_se_manda_tal_cual_sin_volver_a_llamar_a_gemini(bot, muzza):
    servicio, llm = bot
    llm.respuestas = [_tool_call("calcular_y_preparar_pedido", _pedido_args(), "c1")]

    respuesta = _conversar(servicio, "Soy Paula, 11 4444-5555, a Belgrano 95")

    assert len(llm.llamadas) == 1
    assert "Pizza Muzzarella (x1)" in respuesta
    assert "Envío a domicilio: Belgrano 95" in respuesta


def test_si_faltan_datos_el_modelo_redacta_la_respuesta(bot, muzza):
    servicio, llm = bot
    llm.respuestas = [
        _tool_call("calcular_y_preparar_pedido", {"items_solicitados": "1 Pizza Muzzarella"}, "c1"),
        _texto("¿Me pasás tus datos?"),
    ]

    respuesta = _conversar(servicio, "Quiero una muzza")

    assert len(llm.llamadas) == 2
    assert respuesta == "¿Me pasás tus datos?"


def test_el_menu_actual_va_en_las_instrucciones_y_no_como_herramienta(bot, muzza):
    servicio, llm = bot
    llm.respuestas = [_texto("Este es el menú")]

    _conversar(servicio, "¿Qué tienen?")

    instrucciones = llm.llamadas[0][0].content
    assert "MENÚ ACTUAL:" in instrucciones
    assert "Pizza Muzzarella ($8,500.00) [Pizzas]" in instrucciones
    assert "consultar_productos" not in servicio.herramientas_por_nombre
