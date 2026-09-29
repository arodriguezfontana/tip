import asyncio
from unittest.mock import AsyncMock, patch

from app.services import telegram_service
from app.services.telegram_service import TelegramService


def _servicio_con_respuesta(demora_segundos: float, respuesta: str = "Hola!") -> TelegramService:
    async def responder(mensaje, session_id):
        await asyncio.sleep(demora_segundos)
        return respuesta

    servicio = TelegramService.__new__(TelegramService)  # evita instanciar el LLM real
    servicio.chat_service = AsyncMock()
    servicio.chat_service.obtener_respuesta.side_effect = responder
    return servicio


def test_muestra_escribiendo_mientras_procesa_y_lo_corta_al_responder():
    servicio = _servicio_con_respuesta(0.6)

    with patch.object(telegram_service, "TYPING_REFRESH_SECONDS", 0.1), \
         patch.object(telegram_service, "send_typing_action", new_callable=AsyncMock) as typing, \
         patch.object(telegram_service, "send_telegram_message", new_callable=AsyncMock) as enviar:
        async def escenario():
            await servicio.procesar_y_enviar("12345", "hola")
            llamadas = typing.await_count
            # Una vez enviada la respuesta el indicador ya no se renueva.
            await asyncio.sleep(0.3)
            return llamadas

        llamadas_al_responder = asyncio.run(escenario())

    assert llamadas_al_responder >= 2
    assert typing.await_count == llamadas_al_responder
    typing.assert_awaited_with(12345)
    enviar.assert_awaited_once_with(12345, "Hola!")


def test_si_falla_la_ia_corta_el_indicador_y_manda_el_fallback():
    servicio = _servicio_con_respuesta(0)
    servicio.chat_service.obtener_respuesta.side_effect = RuntimeError("Gemini caído")

    with patch.object(telegram_service, "send_typing_action", new_callable=AsyncMock), \
         patch.object(telegram_service, "send_telegram_message", new_callable=AsyncMock) as enviar:
        asyncio.run(servicio.procesar_y_enviar("12345", "hola"))

    enviar.assert_awaited_once_with(12345, telegram_service.MENSAJE_FALLBACK)
