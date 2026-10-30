"""Herramienta del bot para mandarle al cliente las promociones del local.

Aplica la regla de disponibilidad dinámica:
- Si solo hay link, se envía el link.
- Si solo hay imágenes, se envían las imágenes.
- Si hay ambos, se envían ambos.
- Si no hay ninguno, se devuelven las promociones desde la base de datos.
"""

import asyncio
import logging
from functools import partial
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.core.channels import Channel
from app.db.session import SessionLocal
from app.services import promotion_image_service, promotion_service, store_config_service
from app.services.channels import obtener_canal
from app.services.channels.base import ImagenParaEnviar

logger = logging.getLogger(__name__)

PIE_DE_FOTO_PROMOS = "¡Acá te comparto nuestras promociones vigentes!"
MENSAJE_PROMOS_ENVIADO = "Cuando quieras, contame qué promo te gustaría aprovechar y la preparamos."


def _leer_imagenes() -> list[tuple[int, int, str]]:
    db = SessionLocal()
    try:
        return [(i.id, i.version, i.content_type) for i in promotion_image_service.list_promotion_images(db)]
    finally:
        db.close()


def _leer_bytes(image_id: int) -> bytes:
    db = SessionLocal()
    try:
        return promotion_image_service.get_required_promotion_image(db, image_id).data
    finally:
        db.close()


def _leer_link_promociones() -> str | None:
    db = SessionLocal()
    try:
        config = store_config_service.get_or_create_store_config(db)
        return config.promotions_link.strip() if config.promotions_link and config.promotions_link.strip() else None
    except Exception:
        return None
    finally:
        db.close()


def obtener_promociones_actuales() -> str:
    """Devuelve las promociones disponibles cargadas en la base de datos."""
    db = SessionLocal()
    try:
        promos = promotion_service.list_available_promotions(db)
        if not promos:
            return "No hay promociones vigentes en este momento."
        lines = []
        for p in promos:
            items_str = ", ".join(f"{it.quantity}x {it.product.name}" for it in p.items if it.product)
            desc = f": {p.description}" if p.description else ""
            lines.append(f"- {p.name} (${p.price:,.2f}) [{items_str}]{desc}")
        return "\n".join(lines)
    except Exception:
        logger.exception("No se pudieron cargar las promociones para el chatbot.")
        return "No se pudieron cargar las promociones en este momento."
    finally:
        db.close()


@tool
async def enviar_promociones(
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Manda al cliente las promociones u ofertas vigentes del local (imágenes, link externo o lista de base de datos).
    Usala cuando el cliente pida ver promociones, ofertas, combos o descuentos (ej: "qué promociones tienen",
    "hay alguna promo hoy?", "quiero ver las promos", "tienen combos?").
    """
    if canal is None or not chat_id:
        return obtener_promociones_actuales()

    try:
        imagenes = await asyncio.to_thread(_leer_imagenes)
        promotions_link = await asyncio.to_thread(_leer_link_promociones)
    except Exception:
        logger.exception("Error al leer promociones para el chat %s", chat_id)
        return obtener_promociones_actuales()

    canal_de_envio = obtener_canal(canal)
    hay_imagenes = len(imagenes) > 0
    hay_link = bool(promotions_link)

    # Caso 4: No hay ni imágenes ni link -> se devuelven las promociones desde la base de datos
    if not hay_imagenes and not hay_link:
        promos_texto = obtener_promociones_actuales()
        if "No hay promociones" in promos_texto:
            return "En este momento no disponemos de promociones vigentes. Te invito a ver nuestro menú para conocer todas las opciones."
        return f"¡Acá tenés nuestras promociones vigentes!\n\n{promos_texto}\n\n¿Te gustaría aprovechar alguna?"

    # Caso 1: Solo link
    if hay_link and not hay_imagenes:
        mensaje = f"¡Acá podés ver todas nuestras promociones vigentes!\n{promotions_link}\n\n{MENSAJE_PROMOS_ENVIADO}"
        await canal_de_envio.enviar_mensaje(chat_id, mensaje)
        return MENSAJE_PROMOS_ENVIADO

    # Caso 2 y 3: Hay imágenes (y opcionalmente link)
    enviadas = 0
    pie = f"{PIE_DE_FOTO_PROMOS}\nTambién podés verlas online en: {promotions_link}" if hay_link else PIE_DE_FOTO_PROMOS
    for image_id, version, content_type in imagenes:
        imagen = ImagenParaEnviar(version, content_type, partial(_leer_bytes, image_id), clave=image_id)
        try:
            if await canal_de_envio.enviar_imagen(chat_id, imagen, pie if enviadas == 0 else ""):
                enviadas += 1
                await asyncio.sleep(getattr(canal_de_envio, "segundos_de_entrega_de_imagen", 0))
            elif enviadas == 0:
                break
        except Exception:
            logger.exception("No se pudo enviar la imagen %s de promociones al chat %s", image_id, chat_id)
            if enviadas == 0:
                break

    if enviadas > 0:
        if hay_link:
            await canal_de_envio.enviar_mensaje(chat_id, f"Promociones online: {promotions_link}")
        return MENSAJE_PROMOS_ENVIADO

    if hay_link:
        mensaje = f"¡Acá podés ver todas nuestras promociones vigentes!\n{promotions_link}\n\n{MENSAJE_PROMOS_ENVIADO}"
        await canal_de_envio.enviar_mensaje(chat_id, mensaje)
        return MENSAJE_PROMOS_ENVIADO

    # Si falló el envío de imágenes y no hay link, cae a la base de datos
    promos_texto = obtener_promociones_actuales()
    return f"¡Acá tenés nuestras promociones vigentes!\n\n{promos_texto}\n\n¿Te gustaría aprovechar alguna?"

