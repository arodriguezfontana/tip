"""Transcripción de mensajes de voz a texto (Speech-to-Text) con Gemini, la misma IA que atiende el chat.

Así no hace falta otro proveedor ni otra clave: alcanza con GOOGLE_API_KEY. El texto que devuelve sigue el mismo
camino que un mensaje escrito (ver BotService.recibir_audio).
"""

import asyncio
import logging
from functools import lru_cache

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.core.config import settings
from app.services.gemini_models import modelos

logger = logging.getLogger(__name__)

# Gemini a veces deja una petición colgada o responde 503 por alta demanda. Un audio corto se transcribe en 2 a 7 s:
# si ningún modelo respondió en ESPERA_ANTES_DEL_RESPALDO_SEGUNDOS se le pide también al siguiente (ver
# gemini_models.py) y se usa la primera respuesta. Si uno falla, se le pide al siguiente enseguida.
ESPERA_ANTES_DEL_RESPALDO_SEGUNDOS = 6
STT_TIMEOUT_SECONDS = 30

# Con la instrucción de sistema y una respuesta que dice primero si hay voz, el modelo no inventa texto para un
# audio en silencio o con ruido (con la instrucción como un mensaje más, a un silencio le "transcribía" frases
# enteras). La temperatura 0 suma donde el modelo la respeta; algunos, como los "flash-lite", la ignoran.
INSTRUCCION = (
    "Transcribí textualmente el mensaje de voz que le manda un cliente a un restaurante, en el idioma en que habla "
    "(normalmente español rioplatense). Escribí los números con cifras (cantidades, horarios, direcciones). "
    "En la transcripción va solo lo que dice, sin comentarios, aclaraciones ni comillas, y sin cambiar una palabra "
    "por otra parecida aunque te suene rara (ej: el nombre de una comida): escribí lo que se escucha. "
    "Si no hay una voz que se entienda (silencio, ruido o música), indicá hay_voz en false y dejá la transcripción "
    "vacía: nunca inventes lo que podría decir."
)


class _Transcripcion(BaseModel):
    hay_voz: bool
    transcripcion: str


_CONFIGURACION = types.GenerateContentConfig(
    system_instruction=INSTRUCCION,
    temperature=0,
    response_mime_type="application/json",
    response_schema=_Transcripcion,
    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
)

@lru_cache(maxsize=1)
def _cliente_gemini() -> genai.Client:
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


def _tipo_de_audio(mime_type: str) -> str:
    """WhatsApp manda las notas de voz como "audio/ogg; codecs=opus": Gemini espera solo el tipo."""
    return mime_type.split(";")[0].strip().lower() or "audio/ogg"


def _leer(respuesta) -> _Transcripcion:
    if isinstance(respuesta.parsed, _Transcripcion):
        return respuesta.parsed
    return _Transcripcion.model_validate_json(respuesta.text or "")


async def _transcribir_con(modelo: str, audio: types.Part) -> _Transcripcion:
    respuesta = await _cliente_gemini().aio.models.generate_content(
        model=modelo, contents=[audio, "Transcribí este mensaje de voz."], config=_CONFIGURACION
    )
    return _leer(respuesta)


class _TranscripcionConRespaldo:
    """Pide la transcripción al modelo principal y, si tarda o falla, también a los de respaldo, y usa la primera
    respuesta que llegue."""

    def __init__(self, audio: types.Part, mime_type: str):
        self._audio = audio
        self._mime_type = mime_type
        self._por_probar = modelos.en_orden()
        self._en_curso: dict[asyncio.Task, str] = {}

    async def transcribir(self) -> _Transcripcion | None:
        """La primera transcripción que llegue, o None si ningún modelo respondió a tiempo."""
        self._pedir_al_siguiente()
        try:
            return await self._esperar_primera_transcripcion()
        finally:
            for tarea in self._en_curso:
                tarea.cancel()

    def _pedir_al_siguiente(self) -> None:
        if not self._por_probar:
            return
        modelo = self._por_probar.pop(0)
        self._en_curso[asyncio.ensure_future(_transcribir_con(modelo, self._audio))] = modelo

    def _sumar_respaldo(self) -> None:
        """Ninguno respondió todavía: se suma el siguiente modelo (el que estaba sigue corriendo)."""
        if not self._por_probar:
            return
        logger.warning(
            "Gemini %s tarda en transcribir un mensaje de voz: se le pide también a %s.",
            next(iter(self._en_curso.values())),
            self._por_probar[0],
        )
        self._pedir_al_siguiente()

    def _transcripcion_de(self, tarea: asyncio.Task) -> _Transcripcion | None:
        """El resultado de una tarea terminada; None si falló (y entonces se le pide al siguiente modelo)."""
        modelo = self._en_curso.pop(tarea)
        try:
            resultado = tarea.result()
        except Exception as e:
            modelos.registrar_falla(modelo)
            logger.warning("Gemini %s no pudo transcribir un mensaje de voz (%s): %s", modelo, self._mime_type, e)
            self._pedir_al_siguiente()
            return None
        # El que quedó corriendo fue más lento: si era el principal, se empieza un rato por el respaldo.
        for lento in self._en_curso.values():
            modelos.registrar_falla(lento)
        modelos.registrar_exito(modelo)
        return resultado

    async def _esperar_una_ronda(self, segundos_restantes: float) -> _Transcripcion | None:
        """Espera a que termine alguna tarea (o se cumpla el plazo para sumar un respaldo) y devuelve la
        transcripción si alguna salió bien."""
        espera = min(ESPERA_ANTES_DEL_RESPALDO_SEGUNDOS, segundos_restantes) if self._por_probar else segundos_restantes
        terminadas, _ = await asyncio.wait(self._en_curso, timeout=espera, return_when=asyncio.FIRST_COMPLETED)
        if not terminadas:
            self._sumar_respaldo()
            return None
        return next((t for t in map(self._transcripcion_de, terminadas) if t is not None), None)

    async def _esperar_primera_transcripcion(self) -> _Transcripcion | None:
        loop = asyncio.get_running_loop()
        limite = loop.time() + STT_TIMEOUT_SECONDS
        transcripcion = None
        while transcripcion is None and self._en_curso and loop.time() < limite:
            transcripcion = await self._esperar_una_ronda(limite - loop.time())
        return transcripcion


async def transcribir_audio(datos: bytes, mime_type: str) -> str | None:
    """Texto que dice el audio, o None si está vacío, no tiene voz o ningún modelo pudo transcribirlo."""
    if not datos:
        return None
    audio = types.Part.from_bytes(data=datos, mime_type=_tipo_de_audio(mime_type))
    transcripcion = await _TranscripcionConRespaldo(audio, mime_type).transcribir()
    if transcripcion is None:
        logger.error("Ningún modelo de Gemini pudo transcribir el mensaje de voz (%s).", mime_type)
        return None
    texto = transcripcion.transcripcion.strip()
    return texto if transcripcion.hay_voz and texto else None
