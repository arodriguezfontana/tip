"""Conversación del bot con el cliente, independiente del canal (Telegram, WhatsApp, ...).

Cada router de canal traduce su webhook a llamadas a este servicio; la respuesta vuelve por el mismo canal.
"""

import asyncio
import contextlib
import logging
import time

from app.core.channels import Channel, session_key, split_session_key
from app.core.config import settings
from app.core.phone import normalize_phone
from app.services.channels import CanalDeMensajeria, obtener_canal
from app.services.chat_memory import SesionChat
from app.services.chat_service import ChatService
from app.services.human_handoff import derivaciones
from app.services.message_batcher import AgrupadorDeMensajes
from app.services.speech_to_text import transcribir_audio

logger = logging.getLogger(__name__)

MENSAJE_FALLBACK = (
    "Disculpá, tuve un problema para responderte. ¿Podés intentar de nuevo en un momento?"
)

# Marca con la que la transcripción de un audio entra a la conversación: el bot sabe que puede tener errores.
PREFIJO_AUDIO = "[Mensaje de voz transcripto]"
MENSAJE_AUDIO_NO_ENTENDIDO = "🎤 No pude entender tu mensaje de voz. ¿Me lo podés escribir o mandar de nuevo?"
AVISO_AUDIO_SIN_TRANSCRIBIR = "🎤 Mensaje de voz que no se pudo transcribir."
# Un audio ya esperó lo que tarda en transcribirse: se responde casi enseguida, sin la espera completa del agrupador.
ESPERA_TRAS_AUDIO_SEGUNDOS = 1.5


async def _mantener_escribiendo(canal: CanalDeMensajeria, chat_id: str) -> None:
    while True:
        await canal.enviar_escribiendo(chat_id)
        await asyncio.sleep(canal.segundos_entre_avisos_de_escritura)


class BotService:
    def __init__(self):
        self.chat_service = ChatService()
        # Chats a los que se les descartó la última respuesta por quedar vieja (ver _respuesta_quedo_vieja).
        self._descartadas: set[str] = set()
        # Transcripciones de audios en curso (sin la referencia el intérprete podría descartarlas a mitad de camino).
        self._transcripciones: set[asyncio.Task] = set()
        # Los mensajes seguidos de un mismo chat se responden una sola vez (ver message_batcher).
        self.agrupador = AgrupadorDeMensajes(
            procesar=self.procesar_y_enviar,
            espera_segundos=settings.BOT_BATCH_WINDOW_SECONDS,
            espera_maxima_segundos=settings.BOT_BATCH_MAX_WAIT_SECONDS,
            al_empezar=self._avisar_que_escribe,
        )

    def registrar_perfil(
        self,
        canal: Channel,
        chat_id: str,
        nombre: str | None,
        usuario: str | None = None,
        telefono: str | None = None,
    ) -> None:
        """Recuerda quién escribe (según el canal), para identificarlo si pide hablar con una persona."""
        perfil = {
            "nombre": (nombre or "").strip()[:100],
            "usuario": (usuario or "").strip()[:64],
            "telefono": normalize_phone(telefono)[:30],
        }
        sesion = self.chat_service.sesiones.setdefault(session_key(canal, chat_id), SesionChat())
        sesion.perfil = {clave: valor for clave, valor in perfil.items() if valor}

    def recibir_mensaje(self, canal: Channel, chat_id: str, mensaje: str, espera_segundos: float | None = None) -> None:
        """Punto de entrada de los webhooks: encola el mensaje; la respuesta sale cuando el cliente deja de escribir."""
        clave = session_key(canal, chat_id)
        if derivaciones.esta_derivado(clave):
            # Lo atiende una persona: el mensaje le llega al empleado en el panel y el bot no responde.
            derivaciones.registrar_mensaje_del_cliente(clave, mensaje)
            return
        self.agrupador.recibir(clave, mensaje, espera_segundos)

    def recibir_audio(self, canal: Channel, chat_id: str, media_id: str) -> None:
        """Punto de entrada de un mensaje de voz: se transcribe en segundo plano y después sigue como un texto más."""
        tarea = asyncio.ensure_future(self.transcribir_y_recibir(canal, chat_id, media_id))
        self._transcripciones.add(tarea)
        tarea.add_done_callback(self._transcripciones.discard)

    async def transcribir_y_recibir(self, canal: Channel, chat_id: str, media_id: str) -> None:
        clave = session_key(canal, chat_id)
        canal_de_mensajeria = obtener_canal(canal)
        texto = None
        try:
            if not derivaciones.esta_derivado(clave):
                await canal_de_mensajeria.enviar_escribiendo(chat_id)
            audio = await canal_de_mensajeria.descargar_audio(media_id)
            if audio is not None:
                texto = await transcribir_audio(audio.datos, audio.mime_type)
        except Exception:
            logger.exception("Error procesando el mensaje de voz de %s", clave)

        if texto:
            # El texto entra al mismo pipeline que los mensajes escritos (agrupador, IA y herramientas).
            logger.info("Mensaje de voz de %s transcripto: %r", clave, texto)
            self.recibir_mensaje(canal, chat_id, f"{PREFIJO_AUDIO} {texto}", espera_segundos=ESPERA_TRAS_AUDIO_SEGUNDOS)
        elif derivaciones.esta_derivado(clave):
            derivaciones.registrar_mensaje_del_cliente(clave, AVISO_AUDIO_SIN_TRANSCRIBIR)
        else:
            await canal_de_mensajeria.enviar_mensaje(chat_id, MENSAJE_AUDIO_NO_ENTENDIDO)

    @staticmethod
    def _canal_y_chat(clave: str) -> tuple[CanalDeMensajeria, str]:
        canal, chat_id = split_session_key(clave)
        if canal is None:
            raise ValueError(f"La conversación {clave!r} no pertenece a ningún canal.")
        return obtener_canal(canal), chat_id

    async def _avisar_que_escribe(self, clave: str) -> None:
        # Un solo aviso apenas llega el primer mensaje cubre la espera; después lo renueva procesar_y_enviar.
        canal, chat_id = self._canal_y_chat(clave)
        await canal.enviar_escribiendo(chat_id)

    def _respuesta_quedo_vieja(self, clave: str) -> bool:
        """Mientras se preparaba la respuesta el cliente siguió escribiendo: ya no corresponde a su último mensaje.

        En ese caso conviene no mandarla y contestar de una vez a todo lo que escribió (ej. un saludo que llega
        después de que ya pidió su comida). No se descarta si la respuesta tuvo efectos que el cliente debe ver
        (pedido registrado, derivación a una persona) ni dos veces seguidas, para que nunca quede sin respuesta.
        """
        if not self.agrupador.hay_mensajes_esperando(clave):
            self._descartadas.discard(clave)
            return False
        sesion = self.chat_service.sesiones.get(clave)
        tuvo_efectos = derivaciones.esta_derivado(clave) or (sesion is not None and sesion.pedido_registrado_en_este_turno)
        if tuvo_efectos or clave in self._descartadas:
            self._descartadas.discard(clave)
            return False
        self._descartadas.add(clave)
        return True

    async def procesar_y_enviar(self, clave: str, mensaje: str):
        """Procesa el mensaje con el ChatService (IA) y despacha la respuesta por el canal del cliente."""
        inicio = time.perf_counter()
        canal, chat_id = self._canal_y_chat(clave)
        try:
            indicador = asyncio.create_task(_mantener_escribiendo(canal, chat_id))
            try:
                respuesta_ia = await self.chat_service.obtener_respuesta(mensaje, session_id=clave)
            finally:
                indicador.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await indicador
            if self._respuesta_quedo_vieja(clave):
                logger.info("Respuesta a %s descartada: el cliente escribió más mientras se preparaba", clave)
                return
            await canal.enviar_mensaje(chat_id, respuesta_ia)
            logger.info("Mensaje de %s respondido en %.1f s", clave, time.perf_counter() - inicio)
        except Exception:
            logger.exception("Error procesando el mensaje de %s", clave)
            try:
                await canal.enviar_mensaje(chat_id, MENSAJE_FALLBACK)
            except Exception:
                logger.exception("Error enviando el mensaje de fallback a %s", clave)


bot_service = BotService()
