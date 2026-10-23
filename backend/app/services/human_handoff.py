"""Derivación de una conversación del bot a un empleado.

Cuando el cliente pide hablar con una persona, el bot deja de responderle y el chat queda en este registro
hasta que un empleado lo atiende desde el panel y lo finaliza (ahí el bot retoma la conversación).

Todo vive en la memoria del proceso (como las sesiones del chat y el agrupador de mensajes): vale para un
solo proceso del servidor y se pierde al reiniciarlo.
"""

import itertools
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from app.core.errors import ConflictError, NotFoundError

# Tope de mensajes guardados por derivación, para que una charla larga no crezca sin límite.
MAX_MENSAJES_POR_DERIVACION = 300

MENSAJE_DERIVACION = "Listo, ya avisé al local 🙋. En breve te atiende una persona por este mismo chat."
MENSAJE_FIN_DERIVACION = (
    "El empleado finalizó la conversación. ¡Muchas gracias por comunicarte con nosotros! 🙌\n"
    "Ya podés seguir conversando con el bot: escribime cuando quieras para ver el menú o hacer un pedido."
)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class AutorMensaje(str, Enum):
    CLIENTE = "customer"
    BOT = "bot"
    EMPLEADO = "employee"
    SISTEMA = "system"


class EstadoDerivacion(str, Enum):
    ESPERANDO = "waiting"
    EN_CURSO = "in_progress"


class DerivacionInexistenteError(NotFoundError):
    pass


class DerivacionTomadaError(ConflictError):
    pass


@dataclass
class MensajeDerivacion:
    autor: AutorMensaje
    texto: str
    enviado_en: datetime = field(default_factory=_ahora)


@dataclass
class Derivacion:
    id: int
    chat_id: str
    cliente: str | None
    motivo: str | None
    # Cómo identificar al cliente: su @usuario de Telegram y el teléfono que dio al bot (si lo dio).
    usuario: str | None = None
    telefono: str | None = None
    solicitada_en: datetime = field(default_factory=_ahora)
    atendida_por: str | None = None
    mensajes: list[MensajeDerivacion] = field(default_factory=list)
    # Mensajes del cliente que el empleado todavía no vio (para el puntito de la lista de chats).
    sin_leer: int = 0
    historial_adjunto: bool = False

    @property
    def estado(self) -> EstadoDerivacion:
        return EstadoDerivacion.EN_CURSO if self.atendida_por else EstadoDerivacion.ESPERANDO

    def agregar(self, autor: AutorMensaje, texto: str) -> MensajeDerivacion:
        mensaje = MensajeDerivacion(autor, texto)
        self.mensajes.append(mensaje)
        del self.mensajes[:-MAX_MENSAJES_POR_DERIVACION]
        return mensaje


class RegistroDerivaciones:
    """Derivaciones activas, a lo sumo una por chat. Se usa desde el event loop y desde hilos de la API."""

    def __init__(self) -> None:
        self._por_chat: dict[str, Derivacion] = {}
        self._ids = itertools.count(1)
        self._lock = threading.RLock()

    def solicitar(
        self,
        chat_id: str,
        cliente: str | None = None,
        motivo: str | None = None,
        usuario: str | None = None,
        telefono: str | None = None,
    ) -> Derivacion:
        """Abre la derivación del chat. Si ya había una activa, la devuelve sin duplicarla."""
        with self._lock:
            existente = self._por_chat.get(chat_id)
            if existente is not None:
                return existente
            derivacion = Derivacion(
                id=next(self._ids), chat_id=chat_id, cliente=cliente, motivo=motivo, usuario=usuario, telefono=telefono
            )
            self._por_chat[chat_id] = derivacion
            return derivacion

    def esta_derivado(self, chat_id: str) -> bool:
        with self._lock:
            return chat_id in self._por_chat

    def registrar_mensaje_del_cliente(self, chat_id: str, texto: str) -> None:
        with self._lock:
            derivacion = self._por_chat.get(chat_id)
            if derivacion is not None:
                derivacion.agregar(AutorMensaje.CLIENTE, texto)
                derivacion.sin_leer += 1

    def adjuntar_historial(self, chat_id: str, historial: list[MensajeDerivacion]) -> None:
        """Antepone la charla que el cliente tuvo con el bot, para que el empleado llegue con todo el contexto.

        Se hace una sola vez por derivación. Los mensajes que llegaron mientras tanto quedan a continuación.
        """
        with self._lock:
            derivacion = self._por_chat.get(chat_id)
            if derivacion is None or derivacion.historial_adjunto:
                return
            derivacion.historial_adjunto = True
            aviso = MensajeDerivacion(AutorMensaje.SISTEMA, "El cliente pidió hablar con una persona.")
            derivacion.mensajes[:0] = [*historial, aviso]
            del derivacion.mensajes[:-MAX_MENSAJES_POR_DERIVACION]

    def marcar_leida(self, derivacion_id: int) -> None:
        with self._lock:
            self.obtener(derivacion_id).sin_leer = 0

    def listar(self) -> list[Derivacion]:
        with self._lock:
            return sorted(self._por_chat.values(), key=lambda d: d.solicitada_en)

    def obtener(self, derivacion_id: int) -> Derivacion:
        with self._lock:
            for derivacion in self._por_chat.values():
                if derivacion.id == derivacion_id:
                    return derivacion
        raise DerivacionInexistenteError("La conversación derivada ya no está activa.")

    def tomar(self, derivacion_id: int, empleado: str) -> Derivacion:
        """El empleado toma el control. Si ya lo tiene otro empleado, no se le quita."""
        with self._lock:
            derivacion = self.obtener(derivacion_id)
            if derivacion.atendida_por and derivacion.atendida_por != empleado:
                raise DerivacionTomadaError("Otro empleado ya está atendiendo esta conversación.")
            if not derivacion.atendida_por:
                derivacion.atendida_por = empleado
                derivacion.agregar(AutorMensaje.SISTEMA, f"{empleado} tomó la conversación.")
            derivacion.sin_leer = 0
            return derivacion

    def registrar_respuesta(self, derivacion_id: int, empleado: str, texto: str) -> Derivacion:
        """Guarda lo que el empleado le escribe al cliente (quien responde toma la conversación)."""
        with self._lock:
            derivacion = self.tomar(derivacion_id, empleado)
            derivacion.agregar(AutorMensaje.EMPLEADO, texto)
            derivacion.sin_leer = 0
            return derivacion

    def finalizar(self, derivacion_id: int, empleado: str) -> Derivacion:
        """Cierra la derivación: el chat vuelve al bot."""
        with self._lock:
            derivacion = self.obtener(derivacion_id)
            if derivacion.atendida_por and derivacion.atendida_por != empleado:
                raise DerivacionTomadaError("Otro empleado ya está atendiendo esta conversación.")
            del self._por_chat[derivacion.chat_id]
            return derivacion


derivaciones = RegistroDerivaciones()
