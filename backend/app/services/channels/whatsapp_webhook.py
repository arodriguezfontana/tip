"""Lectura de las notificaciones (webhook) que Meta manda a WhatsApp: qué mensajes llegaron y cuáles envió el local."""

from dataclasses import dataclass


@dataclass(frozen=True)
class MensajeRecibido:
    telefono: str
    message_id: str | None
    nombre: str | None
    # Cada mensaje trae texto o, si es un mensaje de voz, el id del audio en Meta.
    texto: str | None = None
    audio_id: str | None = None


def _cambios(data: dict) -> list[dict]:
    return [cambio for entrada in data.get("entry") or [] for cambio in entrada.get("changes") or []]


def _mensaje_recibido(mensaje: dict, nombres: dict) -> MensajeRecibido | None:
    telefono = mensaje.get("from")
    if not telefono:
        return None
    datos = {"telefono": telefono, "message_id": mensaje.get("id"), "nombre": nombres.get(telefono)}
    texto = (mensaje.get("text") or {}).get("body")
    # Las notas de voz y los audios adjuntos llegan como "audio" (.ogg o .mp4).
    audio_id = (mensaje.get("audio") or {}).get("id")
    if mensaje.get("type") == "text" and texto:
        return MensajeRecibido(**datos, texto=texto)
    if mensaje.get("type") == "audio" and audio_id:
        return MensajeRecibido(**datos, audio_id=audio_id)
    return None


def _mensajes_de_un_cambio(cambio: dict) -> list[MensajeRecibido]:
    valor = cambio.get("value") or {}
    nombres = {
        contacto.get("wa_id"): (contacto.get("profile") or {}).get("name") for contacto in valor.get("contacts") or []
    }
    mensajes = (_mensaje_recibido(mensaje, nombres) for mensaje in valor.get("messages") or [])
    return [mensaje for mensaje in mensajes if mensaje is not None]


def mensajes_recibidos(data: dict) -> list[MensajeRecibido]:
    """Mensajes de texto y de voz recibidos en la notificación (lo demás, como imágenes o ubicaciones, se ignora)."""
    return [mensaje for cambio in _cambios(data) for mensaje in _mensajes_de_un_cambio(cambio)]


def chat_del_destinatario(telefono: str) -> str:
    """Inverso de lo que hace el canal al enviar: Meta registra los celulares argentinos como 54... (sin el 9),
    pero el chat del cliente llega como 549..."""
    if telefono.startswith("54") and not telefono.startswith("549") and len(telefono) == 12:
        return "549" + telefono[2:]
    return telefono


def _mensaje_saliente(mensaje: dict) -> tuple[str, str] | None:
    texto = (mensaje.get("text") or {}).get("body")
    if mensaje.get("type", "text") == "text" and texto and mensaje.get("to"):
        return chat_del_destinatario(mensaje["to"]), texto
    return None


def mensajes_salientes(data: dict) -> list[tuple[str, str]]:
    """(teléfono del cliente, texto) de cada mensaje que el local envió desde la app de Meta Business Suite.

    Meta los notifica como "message echoes" (campo `smb_message_echoes`) cuando el número también se usa en la app.
    """
    ecos = [
        mensaje
        for cambio in _cambios(data)
        if cambio.get("field") == "smb_message_echoes"
        for mensaje in (cambio.get("value") or {}).get("message_echoes") or []
    ]
    salientes = (_mensaje_saliente(mensaje) for mensaje in ecos)
    return [saliente for saliente in salientes if saliente is not None]
