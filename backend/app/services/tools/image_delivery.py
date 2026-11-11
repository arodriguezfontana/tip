"""Envío de imágenes y links al cliente por el chat, común a las herramientas del menú y de las promociones."""

import asyncio
import logging
from collections.abc import Callable
from functools import partial

from app.services.channels.base import ImagenParaEnviar

logger = logging.getLogger(__name__)


def limpiar_link(link: str | None) -> str | None:
    """El link sin espacios sobrantes, o None si no hay."""
    return (link or "").strip() or None


async def _enviar_una_imagen(
    canal, chat_id: str, imagen: ImagenParaEnviar, pie: str, que_se_envia: str
) -> bool:
    try:
        if not await canal.enviar_imagen(chat_id, imagen, pie):
            return False
    except Exception:
        logger.exception("No se pudo enviar la imagen %s %s al chat %s", imagen.clave, que_se_envia, chat_id)
        return False
    await asyncio.sleep(getattr(canal, "segundos_de_entrega_de_imagen", 0))
    return True


async def enviar_imagenes(
    canal,
    chat_id: str,
    imagenes: list[tuple[int, int, str]],
    leer_bytes: Callable[[int], bytes],
    pie: str,
    que_se_envia: str,
) -> int:
    """Manda las imágenes (id, versión, tipo) en orden, la primera con el pie de foto. Si la primera falla no insiste
    con las demás; si falla otra, sigue con las que quedan. Devuelve cuántas llegaron a enviarse."""
    if not imagenes:
        return 0
    primera, *resto = [
        ImagenParaEnviar(version, tipo, partial(leer_bytes, image_id), clave=image_id)
        for image_id, version, tipo in imagenes
    ]
    if not await _enviar_una_imagen(canal, chat_id, primera, pie, que_se_envia):
        return 0
    enviadas = 1
    for imagen in resto:
        enviadas += await _enviar_una_imagen(canal, chat_id, imagen, "", que_se_envia)
    return enviadas


async def enviar_si_hay_link(canal, chat_id: str, link: str | None, mensaje: str) -> bool:
    """Manda el mensaje con el link si hay uno cargado; devuelve si lo mandó."""
    if not link:
        return False
    await canal.enviar_mensaje(chat_id, mensaje)
    return True
