"""Herramienta del bot para mandarle al cliente el menú del local en formato imagen."""

import asyncio
import logging
from functools import partial
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.core.channels import Channel
from app.db.session import SessionLocal
from app.services import menu_image_service
from app.services.channels import obtener_canal
from app.services.channels.base import ImagenParaEnviar

logger = logging.getLogger(__name__)

PIE_DE_FOTO = "¡Acá te envío nuestro menú! 🍽️"
# Con la imagen ya enviada, este es el mensaje que sale a continuación (el chat lo reconoce por su texto).
MENSAJE_MENU_ENVIADO = "Cuando quieras, contame qué te gustaría pedir y lo preparamos 😋"
# Se lo ve el modelo (no el cliente): sin imagen cae al menú en texto de siempre.
RESULTADO_SIN_IMAGEN = (
    "No se pudo mandar la imagen del menú (el local no cargó una o este medio no la admite). "
    "Presentale el MENÚ ACTUAL en texto, como indican las instrucciones."
)


def _leer_imagenes() -> list[tuple[int, int, str]]:
    """(id, versión, tipo) de cada imagen del menú, en orden; los bytes se piden aparte, solo si hace falta subirla."""
    db = SessionLocal()
    try:
        return [(i.id, i.version, i.content_type) for i in menu_image_service.list_menu_images(db)]
    finally:
        db.close()


def _leer_bytes(image_id: int) -> bytes:
    db = SessionLocal()
    try:
        return menu_image_service.get_required_menu_image(db, image_id).data
    finally:
        db.close()


@tool
async def enviar_menu_en_imagen(
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Le manda al cliente el menú del local como imagen (o varias, si la carta está partida en secciones). Usala
    cuando pida ver el menú o la carta, o pregunte qué tienen, qué hay para comer, los precios o las promociones
    (ej: "pasame el menú", "mandame la carta", "qué tienen", "precios"). El cliente recibe las imágenes con un
    mensaje; después no escribas nada más.
    """
    if canal is None or not chat_id:
        return RESULTADO_SIN_IMAGEN
    try:
        imagenes = await asyncio.to_thread(_leer_imagenes)
    except Exception:
        logger.exception("No se pudo leer el menú en imagen para el chat %s", chat_id)
        return RESULTADO_SIN_IMAGEN
    enviadas = 0
    canal_de_envio = obtener_canal(canal)
    for image_id, version, content_type in imagenes:
        imagen = ImagenParaEnviar(version, content_type, partial(_leer_bytes, image_id), clave=image_id)
        try:
            # El pie de foto va solo en la primera: las demás completan el mismo menú.
            if await canal_de_envio.enviar_imagen(chat_id, imagen, PIE_DE_FOTO if enviadas == 0 else ""):
                enviadas += 1
                # Que cada imagen llegue antes que la siguiente y que el mensaje final llegue después de todas.
                await asyncio.sleep(getattr(canal_de_envio, "segundos_de_entrega_de_imagen", 0))
            elif enviadas == 0:
                break  # el canal no las admite o falló: no tiene sentido insistir con el resto
        except Exception:
            logger.exception("No se pudo enviar la imagen %s del menú al chat %s", image_id, chat_id)
            if enviadas == 0:
                break
    return MENSAJE_MENU_ENVIADO if enviadas else RESULTADO_SIN_IMAGEN

