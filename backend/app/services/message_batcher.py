"""Agrupa los mensajes que un cliente manda seguidos para responderlos una sola vez.

Quien escribe por chat suele partir una idea en varios mensajes ("Hola" / "Quisiera hacer un pedido"). Si cada
uno se respondiera por separado, el bot saludaría varias veces y, peor, varias respuestas correrían a la vez
sobre la misma conversación. Acá cada mensaje espera unos segundos por si llegan más; pasado ese tiempo sin
novedades se juntan todos y se procesan como uno solo.

Todo vive en la memoria del proceso (como las sesiones del chat): vale para un solo proceso del servidor.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class _Chat:
    """Estado de un chat mientras tiene mensajes esperando o respondiéndose."""

    mensajes: list[str] = field(default_factory=list)
    # Cuándo llegó el primer mensaje del grupo que está esperando (para no postergar la respuesta sin fin).
    desde: float = 0.0
    # Espera en curso: mientras duerme se puede reiniciar; una vez que empieza a responder, ya no.
    temporizador: asyncio.Task | None = None
    # Una respuesta por vez por chat, así nunca se pisan dos turnos de la misma conversación.
    turno: asyncio.Lock = field(default_factory=asyncio.Lock)
    # Tareas de espera/respuesta todavía sin terminar (para saber cuándo se puede olvidar el chat).
    tareas: int = 0


class AgrupadorDeMensajes:
    def __init__(
        self,
        procesar: Callable[[str, str], Awaitable[None]],
        espera_segundos: float = 2.0,
        espera_maxima_segundos: float = 6.0,
        al_empezar: Callable[[str], Awaitable[None]] | None = None,
    ):
        """
        procesar: atiende el mensaje (ya agrupado) de un chat: `procesar(chat_id, texto)`.
        espera_segundos: cuánto se espera, tras el último mensaje, por si llegan más.
        espera_maxima_segundos: tope desde el primer mensaje del grupo, aunque sigan llegando.
        al_empezar: se avisa cuando un chat que estaba quieto recibe un mensaje (ej. mostrar "escribiendo...").
        """
        self._procesar = procesar
        self._espera = espera_segundos
        self._espera_maxima = espera_maxima_segundos
        self._al_empezar = al_empezar
        self._chats: dict[str, _Chat] = {}
        # Referencias a las tareas en vuelo: sin ellas el intérprete podría descartarlas a mitad de camino.
        self._tareas: set[asyncio.Task] = set()

    def recibir(self, chat_id: str, mensaje: str) -> None:
        """Registra un mensaje. Debe llamarse desde el event loop; no espera ni bloquea."""
        chat = self._chats.get(chat_id)
        if chat is None:
            chat = self._chats[chat_id] = _Chat()
            if self._al_empezar is not None:
                self._lanzar(self._avisar_inicio(chat_id))

        ahora = time.monotonic()
        if not chat.mensajes:
            chat.desde = ahora
        chat.mensajes.append(mensaje)

        # Cada mensaje nuevo reinicia la espera, hasta el tope desde el primero del grupo.
        if chat.temporizador is not None:
            chat.temporizador.cancel()
        espera = min(self._espera, max(0.0, chat.desde + self._espera_maxima - ahora))
        chat.tareas += 1
        chat.temporizador = self._lanzar(self._esperar_y_procesar(chat_id, chat, espera))
        # Se limpia al terminar la tarea, también si se cancela antes de empezar (ahí su cuerpo nunca corre).
        chat.temporizador.add_done_callback(lambda _tarea: self._tarea_terminada(chat_id, chat))

    def hay_mensajes_esperando(self, chat_id: str) -> bool:
        """Si el chat tiene mensajes que llegaron mientras se respondía el grupo anterior y todavía no se atendieron."""
        chat = self._chats.get(chat_id)
        return chat is not None and bool(chat.mensajes)

    def _lanzar(self, corrutina: Awaitable[None]) -> asyncio.Task:
        tarea = asyncio.ensure_future(corrutina)
        self._tareas.add(tarea)
        tarea.add_done_callback(self._tareas.discard)
        return tarea

    async def _avisar_inicio(self, chat_id: str) -> None:
        try:
            await self._al_empezar(chat_id)  # type: ignore[misc]
        except Exception:
            logger.exception("Error avisando el inicio de la conversación de chat_id=%s", chat_id)

    def _tarea_terminada(self, chat_id: str, chat: _Chat) -> None:
        chat.tareas -= 1
        if chat.tareas == 0 and not chat.mensajes and self._chats.get(chat_id) is chat:
            del self._chats[chat_id]

    async def _esperar_y_procesar(self, chat_id: str, chat: _Chat, espera: float) -> None:
        await asyncio.sleep(espera)
        # Desde acá la espera ya no se puede reiniciar: los mensajes nuevos arman el grupo siguiente.
        chat.temporizador = None
        async with chat.turno:
            # Se toma todo lo acumulado, incluso lo que llegó mientras se esperaba el turno.
            lote, chat.mensajes = chat.mensajes, []
            if not lote:
                return
            try:
                await self._procesar(chat_id, "\n".join(lote))
            except Exception:
                logger.exception("Error procesando los mensajes de chat_id=%s", chat_id)
