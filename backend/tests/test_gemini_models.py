"""Modelo principal y de respaldo de Gemini: si el principal se cuelga o falla, el bot responde igual."""

import asyncio
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage

from app.core.config import settings
from app.services import chat_service as chat_service_module
from app.services import gemini_models
from app.services.chat_service import MENSAJE_FALLBACK_LOOP, ChatService
from app.services.gemini_models import modelos
from tests.conftest import TestingSessionLocal

PRINCIPAL = settings.BOT_LLM_MODEL
RESPALDO = "modelo-de-respaldo"
OTRO_RESPALDO = "otro-modelo-de-respaldo"


@pytest.fixture(autouse=True)
def dos_respaldos(monkeypatch):
    monkeypatch.setattr(settings, "BOT_LLM_FALLBACK_MODELS", f"{RESPALDO},{OTRO_RESPALDO}")


# --- Orden de los modelos ---


def test_por_defecto_empieza_por_el_principal():
    assert modelos.en_orden() == [PRINCIPAL, RESPALDO, OTRO_RESPALDO]


def test_despues_de_una_falla_del_principal_empieza_por_el_respaldo_un_rato(monkeypatch):
    reloj = {"ahora": 1000.0}
    monkeypatch.setattr(gemini_models.time, "monotonic", lambda: reloj["ahora"])

    modelos.registrar_falla(PRINCIPAL)
    assert modelos.en_orden() == [RESPALDO, OTRO_RESPALDO, PRINCIPAL]

    reloj["ahora"] += gemini_models.SEGUNDOS_EN_RESPALDO + 1
    assert modelos.en_orden() == [PRINCIPAL, RESPALDO, OTRO_RESPALDO]


def test_si_el_principal_vuelve_a_responder_se_usa_de_nuevo_primero():
    modelos.registrar_falla(PRINCIPAL)
    modelos.registrar_exito(PRINCIPAL)

    assert modelos.en_orden() == [PRINCIPAL, RESPALDO, OTRO_RESPALDO]


def test_una_falla_del_respaldo_no_cambia_el_orden():
    modelos.registrar_falla(RESPALDO)

    assert modelos.en_orden() == [PRINCIPAL, RESPALDO, OTRO_RESPALDO]


@pytest.mark.parametrize("respaldos", ["", "   ", PRINCIPAL, f" , {PRINCIPAL} ,"])
def test_sin_respaldo_configurado_usa_solo_el_principal(monkeypatch, respaldos):
    monkeypatch.setattr(settings, "BOT_LLM_FALLBACK_MODELS", respaldos)

    modelos.registrar_falla(PRINCIPAL)

    assert modelos.en_orden() == [PRINCIPAL]


def test_los_respaldos_se_leen_en_orden_sin_repetidos_ni_espacios(monkeypatch):
    monkeypatch.setattr(settings, "BOT_LLM_FALLBACK_MODELS", f" {OTRO_RESPALDO} , {RESPALDO},{OTRO_RESPALDO}")

    assert modelos.en_orden() == [PRINCIPAL, OTRO_RESPALDO, RESPALDO]


# --- El chat con respaldo ---


class FakeLLM:
    def __init__(self, respuesta="¡Hola!", error=None, demora=0.0):
        self.respuesta = respuesta
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
        return AIMessage(content=self.respuesta)


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.menu_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.horario_tools.SessionLocal", TestingSessionLocal):
        yield


def _chat_con(principal: FakeLLM, respaldo: FakeLLM, otro: FakeLLM | None = None) -> ChatService:
    servicio = ChatService(llm=principal)
    servicio._llms = {PRINCIPAL: principal, RESPALDO: respaldo, OTRO_RESPALDO: otro or FakeLLM(error=RuntimeError("503"))}
    servicio._orden_de_modelos = modelos.en_orden
    return servicio


def _conversar(servicio: ChatService) -> str:
    return asyncio.run(servicio.obtener_respuesta("Hola", session_id="12345"))


def test_si_el_principal_responde_no_se_usa_el_respaldo():
    principal, respaldo = FakeLLM("principal"), FakeLLM("respaldo")

    assert _conversar(_chat_con(principal, respaldo)) == "principal"
    assert respaldo.llamadas == 0


def test_si_el_principal_se_cuelga_responde_el_respaldo(monkeypatch):
    monkeypatch.setattr(chat_service_module, "LLM_TIMEOUT_SECONDS", 0.05)
    principal, respaldo = FakeLLM("tarde", demora=1), FakeLLM("respaldo")

    assert _conversar(_chat_con(principal, respaldo)) == "respaldo"
    assert modelos.en_orden() == [RESPALDO, OTRO_RESPALDO, PRINCIPAL]


def test_si_el_principal_da_error_responde_el_respaldo():
    principal, respaldo = FakeLLM(error=RuntimeError("503 UNAVAILABLE")), FakeLLM("respaldo")

    assert _conversar(_chat_con(principal, respaldo)) == "respaldo"


def test_si_el_primer_respaldo_tambien_falla_responde_el_siguiente():
    principal, respaldo = FakeLLM(error=RuntimeError("503")), FakeLLM(error=RuntimeError("503"))
    otro = FakeLLM("otro respaldo")

    assert _conversar(_chat_con(principal, respaldo, otro)) == "otro respaldo"


def test_si_ninguno_responde_a_tiempo_avisa_al_cliente(monkeypatch):
    monkeypatch.setattr(chat_service_module, "LLM_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setattr(chat_service_module, "LLM_FALLBACK_TIMEOUT_SECONDS", 0.05)
    principal, respaldo, otro = FakeLLM("tarde", demora=1), FakeLLM("tarde", demora=1), FakeLLM("tarde", demora=1)

    assert _conversar(_chat_con(principal, respaldo, otro)) == MENSAJE_FALLBACK_LOOP
    assert (principal.llamadas, respaldo.llamadas, otro.llamadas) == (1, 1, 1)
