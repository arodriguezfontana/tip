"""US-44: pedidos por mensaje de voz. Transcripción (Speech-to-Text) y paso al mismo pipeline que un texto."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from google.genai import errors

from app.core.channels import Channel
from app.core.config import settings
from app.services import bot_service, speech_to_text
from app.services.bot_service import (
    AVISO_AUDIO_SIN_TRANSCRIBIR,
    ESPERA_TRAS_AUDIO_SEGUNDOS,
    MENSAJE_AUDIO_NO_ENTENDIDO,
    PREFIJO_AUDIO,
    BotService,
)
from app.services.channels.base import AudioRecibido
from app.services.chat_service import ChatService
from app.services.gemini_models import modelos
from app.services.human_handoff import derivaciones

TELEFONO = "5491155551234"
CLAVE = f"whatsapp:{TELEFONO}"


# --- Transcripción con Gemini ---


def _error_503():
    return errors.ServerError(503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})


@pytest.fixture()
def gemini(monkeypatch):
    """Cliente de Gemini falso: registra lo que se le pide y responde lo configurado (o falla en orden)."""
    estado = {"json": '{"hay_voz": true, "transcripcion": "Quiero dos muzzas para Condarco 1145"}', "errores": [], "llamadas": []}

    async def generate_content(model, contents, config):
        estado["llamadas"].append({"model": model, "contents": contents, "config": config})
        if estado["errores"]:
            error = estado["errores"].pop(0)
            if error == "colgado":
                await asyncio.sleep(1)
            else:
                raise error
        return SimpleNamespace(text=estado["json"], parsed=None)

    cliente = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    monkeypatch.setattr(speech_to_text, "_cliente_gemini", lambda: cliente)
    monkeypatch.setattr(speech_to_text, "ESPERA_ANTES_DEL_RESPALDO_SEGUNDOS", 0.05)
    monkeypatch.setattr(speech_to_text, "STT_TIMEOUT_SECONDS", 0.5)
    return estado


def _modelos_llamados(gemini) -> list[str]:
    return [llamada["model"] for llamada in gemini["llamadas"]]


def test_transcribe_el_audio_y_devuelve_el_texto(gemini):
    texto = asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg; codecs=opus"))

    assert texto == "Quiero dos muzzas para Condarco 1145"
    [llamada] = gemini["llamadas"]
    audio = llamada["contents"][0]
    assert audio.inline_data.mime_type == "audio/ogg"  # sin el "; codecs=opus" que manda WhatsApp
    assert audio.inline_data.data == b"OggS123"
    # Con la instrucción como un mensaje más y sin respuesta estructurada, el modelo "transcribía" frases
    # inventadas a partir de un silencio.
    assert "nunca inventes" in llamada["config"].system_instruction
    assert llamada["config"].response_schema is speech_to_text._Transcripcion


def test_acepta_audios_mp4(gemini):
    asyncio.run(speech_to_text.transcribir_audio(b"....ftyp", "audio/mp4"))

    assert gemini["llamadas"][0]["contents"][0].inline_data.mime_type == "audio/mp4"


@pytest.mark.parametrize(
    "respuesta",
    [
        '{"hay_voz": false, "transcripcion": ""}',
        # Aunque devuelva texto, si dice que no hay voz no se usa.
        '{"hay_voz": false, "transcripcion": "Quería cancelar la reserva"}',
        '{"hay_voz": true, "transcripcion": "   "}',
    ],
)
def test_un_audio_sin_voz_no_devuelve_texto(gemini, respuesta):
    gemini["json"] = respuesta

    assert asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg")) is None


def test_usa_el_modelo_principal(gemini):
    asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg"))

    assert _modelos_llamados(gemini) == [settings.BOT_LLM_MODEL]


@pytest.mark.parametrize("falla", [_error_503(), "colgado", RuntimeError("respuesta rara")])
def test_si_el_modelo_principal_falla_o_se_cuelga_transcribe_con_el_de_respaldo(gemini, falla):
    gemini["errores"] = [falla]

    assert asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg")) == "Quiero dos muzzas para Condarco 1145"
    assert _modelos_llamados(gemini) == [settings.BOT_LLM_MODEL, modelos.respaldos[0]]
    # Mientras dure el problema, las próximas llamadas empiezan por el respaldo.
    assert modelos.en_orden()[0] == modelos.respaldos[0]


def test_despues_de_una_falla_empieza_por_el_respaldo(gemini):
    gemini["errores"] = [_error_503()]
    asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg"))
    gemini["llamadas"].clear()

    asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg"))

    assert _modelos_llamados(gemini) == [modelos.respaldos[0]]


def test_si_el_primer_respaldo_tambien_falla_prueba_el_siguiente(gemini):
    gemini["errores"] = [_error_503(), _error_503()]

    assert asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg")) == "Quiero dos muzzas para Condarco 1145"
    assert _modelos_llamados(gemini) == [settings.BOT_LLM_MODEL, *modelos.respaldos[:2]]


def test_si_ningun_modelo_responde_no_devuelve_texto(gemini, caplog):
    cantidad = len(modelos.en_orden())
    gemini["errores"] = [_error_503()] * cantidad

    assert asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg")) is None
    assert len(gemini["llamadas"]) == cantidad
    assert "Ningún modelo de Gemini pudo transcribir" in caplog.text


def test_si_todos_los_modelos_se_cuelgan_no_devuelve_texto(gemini, monkeypatch, caplog):
    monkeypatch.setattr(speech_to_text, "STT_TIMEOUT_SECONDS", 0.3)
    cantidad = len(modelos.en_orden())
    gemini["errores"] = ["colgado"] * cantidad

    assert asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg")) is None
    assert len(gemini["llamadas"]) == cantidad
    assert "Ningún modelo de Gemini pudo transcribir" in caplog.text


def test_una_respuesta_invalida_de_todos_los_modelos_no_devuelve_texto(gemini):
    gemini["json"] = "esto no es json"

    assert asyncio.run(speech_to_text.transcribir_audio(b"OggS123", "audio/ogg")) is None
    assert len(gemini["llamadas"]) == len(modelos.en_orden())


def test_un_audio_vacio_no_se_manda_a_transcribir(gemini):
    assert asyncio.run(speech_to_text.transcribir_audio(b"", "audio/ogg")) is None
    assert gemini["llamadas"] == []


# --- Del audio al pipeline del bot ---


@pytest.fixture()
def canal(monkeypatch):
    falso = MagicMock()
    falso.enviar_mensaje = AsyncMock()
    falso.enviar_escribiendo = AsyncMock()
    falso.descargar_audio = AsyncMock(return_value=AudioRecibido(datos=b"OggS123", mime_type="audio/ogg"))
    monkeypatch.setattr(bot_service, "obtener_canal", lambda _canal: falso)
    return falso


@pytest.fixture()
def servicio():
    servicio = BotService.__new__(BotService)  # evita instanciar el LLM real
    servicio._transcripciones = set()
    servicio.agrupador = MagicMock()
    return servicio


@pytest.fixture()
def transcripcion(monkeypatch):
    transcribir = AsyncMock(return_value="Quiero dos muzzas")
    monkeypatch.setattr(bot_service, "transcribir_audio", transcribir)
    return transcribir


@pytest.fixture()
def atendido_por_una_persona(monkeypatch):
    """El chat está derivado a un empleado: se guarda lo que le llega al panel."""
    registrados = []
    monkeypatch.setattr(derivaciones, "esta_derivado", lambda clave: clave == CLAVE)
    monkeypatch.setattr(
        derivaciones, "registrar_mensaje_del_cliente", lambda clave, texto: registrados.append((clave, texto))
    )
    return registrados


def test_la_transcripcion_entra_al_mismo_pipeline_que_un_texto(servicio, canal, transcripcion):
    asyncio.run(servicio.transcribir_y_recibir(Channel.WHATSAPP, TELEFONO, "AUDIO123"))

    canal.descargar_audio.assert_awaited_once_with("AUDIO123")
    transcripcion.assert_awaited_once_with(b"OggS123", "audio/ogg")
    # Pasa por el agrupador, como cualquier mensaje escrito, marcado como audio.
    servicio.agrupador.recibir.assert_called_once_with(
        CLAVE, f"{PREFIJO_AUDIO} Quiero dos muzzas", ESPERA_TRAS_AUDIO_SEGUNDOS
    )
    canal.enviar_escribiendo.assert_awaited_once_with(TELEFONO)
    canal.enviar_mensaje.assert_not_awaited()


def test_recibir_audio_lo_procesa_en_segundo_plano(servicio, canal, transcripcion):
    async def escenario():
        servicio.recibir_audio(Channel.WHATSAPP, TELEFONO, "AUDIO123")
        servicio.agrupador.recibir.assert_not_called()  # vuelve enseguida, sin esperar la transcripción
        await asyncio.gather(*servicio._transcripciones)

    asyncio.run(escenario())

    servicio.agrupador.recibir.assert_called_once_with(
        CLAVE, f"{PREFIJO_AUDIO} Quiero dos muzzas", ESPERA_TRAS_AUDIO_SEGUNDOS
    )
    assert servicio._transcripciones == set()


@pytest.mark.parametrize("motivo", ["no_se_descargo", "no_se_entendio", "error"])
def test_si_el_audio_no_se_puede_transcribir_le_pide_que_lo_escriba(servicio, canal, transcripcion, motivo):
    if motivo == "no_se_descargo":
        canal.descargar_audio.return_value = None
    elif motivo == "no_se_entendio":
        transcripcion.return_value = None
    else:
        transcripcion.side_effect = RuntimeError("falla inesperada")

    asyncio.run(servicio.transcribir_y_recibir(Channel.WHATSAPP, TELEFONO, "AUDIO123"))

    canal.enviar_mensaje.assert_awaited_once_with(TELEFONO, MENSAJE_AUDIO_NO_ENTENDIDO)
    servicio.agrupador.recibir.assert_not_called()


def test_si_lo_atiende_una_persona_la_transcripcion_le_llega_al_panel(
    servicio, canal, transcripcion, atendido_por_una_persona
):
    asyncio.run(servicio.transcribir_y_recibir(Channel.WHATSAPP, TELEFONO, "AUDIO123"))

    assert atendido_por_una_persona == [(CLAVE, f"{PREFIJO_AUDIO} Quiero dos muzzas")]
    canal.enviar_escribiendo.assert_not_awaited()  # el bot no va a responder
    servicio.agrupador.recibir.assert_not_called()


def test_si_lo_atiende_una_persona_y_no_se_entiende_se_avisa_en_el_panel(
    servicio, canal, transcripcion, atendido_por_una_persona
):
    transcripcion.return_value = None

    asyncio.run(servicio.transcribir_y_recibir(Channel.WHATSAPP, TELEFONO, "AUDIO123"))

    assert atendido_por_una_persona == [(CLAVE, AVISO_AUDIO_SIN_TRANSCRIBIR)]
    canal.enviar_mensaje.assert_not_awaited()


def test_el_bot_confirma_con_el_detalle_antes_de_registrar_un_pedido_por_audio():
    prompt = ChatService(llm=MagicMock()).system_prompt

    assert '"[Mensaje de voz transcripto]"' in prompt
    assert "Nunca registres un pedido directamente a partir de un audio" in prompt
    assert '"calcular_y_preparar_pedido"' in prompt


def test_la_transcripcion_no_cambia_palabras_por_otras_parecidas():
    assert "sin cambiar una palabra" in speech_to_text.INSTRUCCION
