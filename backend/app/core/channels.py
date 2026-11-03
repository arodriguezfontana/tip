"""Canales de mensajería por los que el cliente puede hablar con el bot."""

from enum import Enum


class Channel(str, Enum):
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"

    def __str__(self) -> str:
        return self.value


def session_key(channel: Channel | str, chat_id: str) -> str:
    """Identifica una conversación entre canales: el mismo número en Telegram y en WhatsApp son chats distintos."""
    return f"{Channel(channel).value}:{chat_id}"


def split_session_key(key: str) -> tuple[Channel | None, str]:
    """Inverso de `session_key`. Una clave sin canal (ej. la sesión de prueba del panel) devuelve canal None."""
    prefix, separator, chat_id = key.partition(":")
    if separator:
        try:
            return Channel(prefix), chat_id
        except ValueError:
            pass
    return None, key
