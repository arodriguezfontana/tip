"""Herramienta del bot para mandarle al cliente el menú del local en formato imagen o link externo.

Aplica la regla de disponibilidad dinámica:
- Si solo hay link, se envía el link.
- Si solo hay imágenes, se envían las imágenes.
- Si hay ambos, se envían ambos.
- Si no hay ninguno, se mantiene el comportamiento de devolverlo desde la base de datos (texto).
"""

import asyncio
import logging
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.core.channels import Channel
from app.db.session import SessionLocal
from app.services import menu_image_service, store_config_service
from app.services.channels import obtener_canal
from app.services.tools.image_delivery import enviar_imagenes, enviar_si_hay_link, limpiar_link

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
        return limpiar_link(config.menu_link)
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
    pie = f"{PIE_DE_FOTO}\nTambién podés ver nuestro menú online en: {menu_link}" if menu_link else PIE_DE_FOTO
    enviadas = await enviar_imagenes(canal_de_envio, chat_id, imagenes, _leer_bytes, pie, "del menú")
    if enviadas > 0:
        await enviar_si_hay_link(canal_de_envio, chat_id, menu_link, f"Menú online: {menu_link}")
        return MENSAJE_MENU_ENVIADO

    # Sin imágenes (o si no se pudo mandar ninguna), el link solo; y sin link, el menú en texto.
    mensaje = f"¡Acá podés ver nuestro menú completo!\n{menu_link}\n\n{MENSAJE_MENU_ENVIADO}"
    if await enviar_si_hay_link(canal_de_envio, chat_id, menu_link, mensaje):
        return MENSAJE_MENU_ENVIADO
    return RESULTADO_SIN_IMAGEN
