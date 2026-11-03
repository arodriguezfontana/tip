"""Herramienta del bot para mandarle al cliente el menú del local en formato imagen o link externo.

Aplica la regla de disponibilidad dinámica:
- Si solo hay link, se envía el link.
- Si solo hay imágenes, se envían las imágenes.
- Si hay ambos, se envían ambos.
- Si no hay ninguno, se mantiene el comportamiento de devolverlo desde la base de datos (texto).
"""

import asyncio
import logging
from functools import partial
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.core.channels import Channel
from app.db.session import SessionLocal
from app.services import menu_image_service, store_config_service
from app.services.channels import obtener_canal
from app.services.channels.base import ImagenParaEnviar

logger = logging.getLogger(__name__)

PIE_DE_FOTO = "¡Acá te envío nuestro menú!"
# Con la imagen o link ya enviado, este es el mensaje que sale a continuación.
MENSAJE_MENU_ENVIADO = "Cuando quieras, contame qué te gustaría pedir y lo preparamos."
# Se lo ve el modelo (no el cliente): sin imagen ni link cae al menú en texto de siempre.
RESULTADO_SIN_IMAGEN = (
    "No se pudo mandar la imagen del menú ni hay link externo cargado. "
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


def _leer_link_menu() -> str | None:
    db = SessionLocal()
    try:
        config = store_config_service.get_or_create_store_config(db)
        return config.menu_link.strip() if config.menu_link and config.menu_link.strip() else None
    except Exception:
        return None
    finally:
        db.close()


@tool
async def enviar_menu_en_imagen(
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Le manda al cliente el menú del local (imágenes, link externo o texto). Usala
    cuando pida ver el menú o la carta, o pregunte qué tienen, qué hay para comer o los precios
    (ej: "pasame el menú", "mandame la carta", "qué tienen", "precios"). El cliente recibe las imágenes y/o link;
    después no escribas nada más. Solo si no hay imágenes ni link, presentale el MENÚ ACTUAL en texto.
    """
    if canal is None or not chat_id:
        return RESULTADO_SIN_IMAGEN

    try:
        imagenes = await asyncio.to_thread(_leer_imagenes)
        menu_link = await asyncio.to_thread(_leer_link_menu)
    except Exception:
        logger.exception("No se pudo leer el menú para el chat %s", chat_id)
        return RESULTADO_SIN_IMAGEN

    canal_de_envio = obtener_canal(canal)
    hay_imagenes = len(imagenes) > 0
    hay_link = bool(menu_link)

    # Caso 4: Ni imágenes ni link -> cae al menú en texto de la base de datos
    if not hay_imagenes and not hay_link:
        return RESULTADO_SIN_IMAGEN

    # Caso 1: Solo link
    if hay_link and not hay_imagenes:
        mensaje = f"¡Acá podés ver nuestro menú completo!\n{menu_link}\n\n{MENSAJE_MENU_ENVIADO}"
        await canal_de_envio.enviar_mensaje(chat_id, mensaje)
        return MENSAJE_MENU_ENVIADO

    # Caso 2 y 3: Hay imágenes (y opcionalmente link)
    enviadas = 0
    pie = f"{PIE_DE_FOTO}\nTambién podés ver nuestro menú online en: {menu_link}" if hay_link else PIE_DE_FOTO
    for image_id, version, content_type in imagenes:
        imagen = ImagenParaEnviar(version, content_type, partial(_leer_bytes, image_id), clave=image_id)
        try:
            if await canal_de_envio.enviar_imagen(chat_id, imagen, pie if enviadas == 0 else ""):
                enviadas += 1
                await asyncio.sleep(getattr(canal_de_envio, "segundos_de_entrega_de_imagen", 0))
            elif enviadas == 0:
                break
        except Exception:
            logger.exception("No se pudo enviar la imagen %s del menú al chat %s", image_id, chat_id)
            if enviadas == 0:
                break

    if enviadas > 0:
        if hay_link:
            await canal_de_envio.enviar_mensaje(chat_id, f"Menú online: {menu_link}")
        return MENSAJE_MENU_ENVIADO

    if hay_link:
        mensaje = f"¡Acá podés ver nuestro menú completo!\n{menu_link}\n\n{MENSAJE_MENU_ENVIADO}"
        await canal_de_envio.enviar_mensaje(chat_id, mensaje)
        return MENSAJE_MENU_ENVIADO

    return RESULTADO_SIN_IMAGEN
