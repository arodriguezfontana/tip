"""Derivación de una conversación del bot a un empleado.

Cuando el cliente pide hablar con una persona, el bot deja de responderle y el chat queda en este registro
hasta que un empleado lo atiende desde el panel y lo finaliza (ahí el bot retoma la conversación).

Todo vive en la memoria del proceso (como las sesiones del chat y el agrupador de mensajes): vale para un
solo proceso del servidor y se pierde al reiniciarlo.
"""

import itertools
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError

# Tope de mensajes guardados por derivación, para que una charla larga no crezca sin límite.
MAX_MENSAJES_POR_DERIVACION = 300

MENSAJE_DERIVACION = "Listo, ya avisé al local 🙋. En breve te atiende una persona por este mismo chat."
MENSAJE_FIN_DERIVACION = (
    "El empleado finalizó la conversación. ¡Muchas gracias por comunicarte con nosotros! 🙌\n"
    "Ya podés seguir conversando con el bot: escribime cuando quieras para ver el menú o hacer un pedido."
)


# Quién figura como responsable cuando el local escribe desde la app de Meta Business Suite (no desde el panel).
EMPLEADO_EXTERNO = "Meta Business Suite"


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _timeout() -> timedelta:
    """Sin mensajes (del cliente o del local) durante este tiempo, el chat vuelve al bot."""
    return timedelta(seconds=settings.MANUAL_MODE_TIMEOUT_SECONDS)


class AutorMensaje(str, Enum):
    CLIENTE = "customer"
    BOT = "bot"
    EMPLEADO = "employee"
    SISTEMA = "system"


class EstadoDerivacion(str, Enum):
    ESPERANDO = "waiting"
    EN_CURSO = "in_progress"
    # Chat que todavía atiende el bot (nadie lo intervino): solo se usa para mostrar el historial de un pedido.
    BOT = "bot"


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
    # Clave de la conversación (canal y chat del cliente, ver core.channels.session_key).
    chat_id: str
    cliente: str | None
    motivo: str | None
    # Cómo identificar al cliente: su @usuario (Telegram) y el teléfono que dio al bot (si lo dio).
    usuario: str | None = None
    telefono: str | None = None
    solicitada_en: datetime = field(default_factory=_ahora)
    atendida_por: str | None = None
    mensajes: list[MensajeDerivacion] = field(default_factory=list)
    # Mensajes del cliente que el empleado todavía no vio (para el puntito de la lista de chats).
    sin_leer: int = 0
    historial_adjunto: bool = False
    # Último mensaje del cliente o del local: desde acá corre el tiempo para que el bot retome el chat.
    ultima_actividad: datetime = field(default_factory=_ahora)
    # Chat no registrado (id 0): el bot sigue atendiendo y se muestra solo su historial.
    transitoria: bool = False

    @property
    def estado(self) -> EstadoDerivacion:
        if self.transitoria:
            return EstadoDerivacion.BOT
        return EstadoDerivacion.EN_CURSO if self.atendida_por else EstadoDerivacion.ESPERANDO

    @property
    def externa(self) -> bool:
        return self.atendida_por == EMPLEADO_EXTERNO

    @property
    def vence_en(self) -> datetime:
        return self.ultima_actividad + _timeout()

    def agregar(self, autor: AutorMensaje, texto: str) -> MensajeDerivacion:
        mensaje = MensajeDerivacion(autor, texto)
        if autor != AutorMensaje.SISTEMA:
            self.ultima_actividad = mensaje.enviado_en
        self.mensajes.append(mensaje)
        del self.mensajes[:-MAX_MENSAJES_POR_DERIVACION]
        return mensaje


class RegistroDerivaciones:
    """Derivaciones activas, a lo sumo una por chat. Se usa desde el event loop y desde hilos de la API."""

    def __init__(self) -> None:
        self._por_chat: dict[str, Derivacion] = {}
        self._ids = itertools.count(1)
        self._lock = threading.RLock()

    def _vencer_inactivas(self) -> None:
        """Devuelve al bot los chats sin actividad durante el tiempo límite (reactivación automática)."""
        limite = _ahora() - _timeout()
        for chat_id in [c for c, d in self._por_chat.items() if d.ultima_actividad <= limite]:
            del self._por_chat[chat_id]

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
            self._vencer_inactivas()
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
            self._vencer_inactivas()
            return chat_id in self._por_chat

    def del_chat(self, chat_id: str) -> Derivacion | None:
        with self._lock:
            self._vencer_inactivas()
            return self._por_chat.get(chat_id)

    def intervenir(
        self,
        chat_id: str,
        empleado: str,
        cliente: str | None = None,
        usuario: str | None = None,
        telefono: str | None = None,
        historial: list[MensajeDerivacion] | None = None,
    ) -> Derivacion:
        """Un empleado interviene un chat que atendía el bot: el bot se pausa y el empleado queda a cargo.

        Si el chat ya estaba derivado, lo toma (o falla si lo atiende otro empleado).
        """
        with self._lock:
            derivacion = self.solicitar(chat_id, cliente=cliente, usuario=usuario, telefono=telefono)
            if historial:
                self.adjuntar_historial(chat_id, historial, aviso=None)
            return self.tomar(derivacion.id, empleado)

    def registrar_mensaje_externo(
        self, chat_id: str, texto: str, historial: list[MensajeDerivacion] | None = None
    ) -> Derivacion:
        """El local le escribió al cliente desde la app de Meta: el bot se pausa (o sigue pausado) y el mensaje
        queda en el historial."""
        with self._lock:
            nueva = not self.esta_derivado(chat_id)
            derivacion = self.solicitar(chat_id, motivo="El local escribió desde Meta Business Suite")
            if nueva:
                self._tomar_desde_meta(derivacion, historial)
            derivacion.agregar(AutorMensaje.EMPLEADO, texto)
            return derivacion

    def _tomar_desde_meta(self, derivacion: Derivacion, historial: list[MensajeDerivacion] | None) -> None:
        if historial:
            self.adjuntar_historial(derivacion.chat_id, historial, aviso=None)
        derivacion.atendida_por = EMPLEADO_EXTERNO
        derivacion.agregar(AutorMensaje.SISTEMA, "El local tomó la conversación desde Meta Business Suite.")

    def registrar_mensaje_del_cliente(self, chat_id: str, texto: str) -> None:
        with self._lock:
            self._vencer_inactivas()
            derivacion = self._por_chat.get(chat_id)
            if derivacion is not None:
                derivacion.agregar(AutorMensaje.CLIENTE, texto)
                derivacion.sin_leer += 1

    def adjuntar_historial(
        self,
        chat_id: str,
        historial: list[MensajeDerivacion],
        aviso: str | None = "El cliente pidió hablar con una persona.",
    ) -> None:
        """Antepone la charla que el cliente tuvo con el bot, para que el empleado llegue con todo el contexto.

        Se hace una sola vez por derivación. Los mensajes que llegaron mientras tanto quedan a continuación.
        """
        with self._lock:
            derivacion = self._por_chat.get(chat_id)
            if derivacion is None or derivacion.historial_adjunto:
                return
            derivacion.historial_adjunto = True
            cierre = [MensajeDerivacion(AutorMensaje.SISTEMA, aviso)] if aviso else []
            derivacion.mensajes[:0] = [*historial, *cierre]
            del derivacion.mensajes[:-MAX_MENSAJES_POR_DERIVACION]

    def marcar_leida(self, derivacion_id: int) -> None:
        with self._lock:
            self.obtener(derivacion_id).sin_leer = 0

    def listar(self) -> list[Derivacion]:
        with self._lock:
            self._vencer_inactivas()
            return sorted(self._por_chat.values(), key=lambda d: d.solicitada_en)

    def obtener(self, derivacion_id: int) -> Derivacion:
        with self._lock:
            self._vencer_inactivas()
            derivacion = next((d for d in self._por_chat.values() if d.id == derivacion_id), None)
        if derivacion is None:
            raise DerivacionInexistenteError("La conversación derivada ya no está activa.")
        return derivacion

    def tomar(self, derivacion_id: int, empleado: str) -> Derivacion:
        """El empleado toma el control. Si ya lo tiene otro empleado, no se le quita."""
        with self._lock:
            derivacion = self.obtener(derivacion_id)
            # Lo que atiende el local desde la app de Meta no tiene un empleado del panel a cargo: se puede tomar.
            if derivacion.atendida_por and derivacion.atendida_por != empleado and not derivacion.externa:
                raise DerivacionTomadaError("Otro empleado ya está atendiendo esta conversación.")
            if derivacion.atendida_por != empleado:
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
            if derivacion.atendida_por and derivacion.atendida_por != empleado and not derivacion.externa:
                raise DerivacionTomadaError("Otro empleado ya está atendiendo esta conversación.")
            del self._por_chat[derivacion.chat_id]
            return derivacion


derivaciones = RegistroDerivaciones()
