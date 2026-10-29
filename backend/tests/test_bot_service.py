import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.channels import Channel
from app.services import bot_service
from app.services.bot_service import BotService
from app.services.chat_memory import SesionChat


def _servicio_con_respuesta(demora_segundos: float, respuesta: str = "Hola!") -> BotService:
    async def responder(mensaje, session_id):
        await asyncio.sleep(demora_segundos)
        return respuesta

    servicio = BotService.__new__(BotService)  # evita instanciar el LLM real
    servicio.chat_service = AsyncMock()
    servicio.chat_service.obtener_respuesta.side_effect = responder
    servicio.chat_service.sesiones = {}
    servicio.agrupador = MagicMock()
    servicio.agrupador.hay_mensajes_esperando.return_value = False
    servicio._descartadas = set()
    return servicio


@pytest.fixture()
def canal(monkeypatch):
    """Canal falso en lugar del real, para ver qué le manda el bot."""
    falso = MagicMock()
    falso.enviar_mensaje = AsyncMock()
    falso.enviar_escribiendo = AsyncMock()
    falso.segundos_entre_avisos_de_escritura = 0.1
    monkeypatch.setattr(bot_service, "obtener_canal", lambda _canal: falso)
    return falso


def test_muestra_escribiendo_mientras_procesa_y_lo_corta_al_responder(canal):
    servicio = _servicio_con_respuesta(0.6)

    async def escenario():
        await servicio.procesar_y_enviar("telegram:12345", "hola")
        llamadas = canal.enviar_escribiendo.await_count
        # Una vez enviada la respuesta el indicador ya no se renueva.
        await asyncio.sleep(0.3)
        return llamadas

    llamadas_al_responder = asyncio.run(escenario())

    assert llamadas_al_responder >= 2
    assert canal.enviar_escribiendo.await_count == llamadas_al_responder
    canal.enviar_escribiendo.assert_awaited_with("12345")
    canal.enviar_mensaje.assert_awaited_once_with("12345", "Hola!")
    servicio.chat_service.obtener_respuesta.assert_awaited_once_with("hola", session_id="telegram:12345")


def test_responde_por_el_canal_en_que_escribio_el_cliente(monkeypatch, canal):
    pedidos = []
    monkeypatch.setattr(bot_service, "obtener_canal", lambda nombre: pedidos.append(nombre) or canal)
    servicio = _servicio_con_respuesta(0)

    asyncio.run(servicio.procesar_y_enviar("whatsapp:5491155551234", "hola"))

    assert pedidos == [Channel.WHATSAPP]
    canal.enviar_mensaje.assert_awaited_once_with("5491155551234", "Hola!")


def test_si_falla_la_ia_corta_el_indicador_y_manda_el_fallback(canal):
    servicio = _servicio_con_respuesta(0)
    servicio.chat_service.obtener_respuesta.side_effect = RuntimeError("Gemini caído")

    asyncio.run(servicio.procesar_y_enviar("telegram:12345", "hola"))

    canal.enviar_mensaje.assert_awaited_once_with("12345", bot_service.MENSAJE_FALLBACK)


# --- Respuestas que quedan viejas porque el cliente siguió escribiendo ---


def _servicio_con_cliente_que_sigue_escribiendo(esperando: bool) -> BotService:
    servicio = _servicio_con_respuesta(0)
    servicio.agrupador.hay_mensajes_esperando.return_value = esperando
    return servicio


def test_si_el_cliente_sigue_escribiendo_se_descarta_la_respuesta_vieja(canal):
    servicio = _servicio_con_cliente_que_sigue_escribiendo(esperando=True)

    asyncio.run(servicio.procesar_y_enviar("whatsapp:5491155551234", "Buenas"))

    canal.enviar_mensaje.assert_not_awaited()


def test_sin_mensajes_nuevos_la_respuesta_sale_como_siempre(canal):
    servicio = _servicio_con_cliente_que_sigue_escribiendo(esperando=False)

    asyncio.run(servicio.procesar_y_enviar("whatsapp:5491155551234", "Buenas"))

    canal.enviar_mensaje.assert_awaited_once_with("5491155551234", "Hola!")


def test_nunca_se_descartan_dos_respuestas_seguidas(canal):
    servicio = _servicio_con_cliente_que_sigue_escribiendo(esperando=True)

    asyncio.run(servicio.procesar_y_enviar("whatsapp:5491155551234", "uno"))
    asyncio.run(servicio.procesar_y_enviar("whatsapp:5491155551234", "dos"))

    canal.enviar_mensaje.assert_awaited_once()


def test_no_se_descarta_la_respuesta_de_un_pedido_registrado(canal):
    servicio = _servicio_con_cliente_que_sigue_escribiendo(esperando=True)
    sesion = SesionChat()
    sesion.pedido_registrado_en_este_turno = True
    servicio.chat_service.sesiones["whatsapp:5491155551234"] = sesion

    asyncio.run(servicio.procesar_y_enviar("whatsapp:5491155551234", "Confirmo"))

    canal.enviar_mensaje.assert_awaited_once()
