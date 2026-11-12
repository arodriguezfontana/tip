"""Herramienta del bot para mandarle al cliente las promociones del local.

Aplica la regla de disponibilidad dinámica:
- Si solo hay link, se envía el link.
- Si solo hay imágenes, se envían las imágenes.
- Si hay ambos, se envían ambos.
- Si no hay ninguno, se devuelven las promociones desde la base de datos.
"""

import asyncio
import logging
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.core.channels import Channel
from app.db.session import SessionLocal
from app.services import promotion_image_service, promotion_service, store_config_service
from app.services.channels import obtener_canal
from app.services.tools.image_delivery import enviar_imagenes, enviar_si_hay_link, limpiar_link

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
        return limpiar_link(config.promotions_link)
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


def _promociones_desde_la_base() -> str:
    """Las promociones vigentes en texto, para cuando no hay imágenes ni link que mandar."""
    promos_texto = obtener_promociones_actuales()
    if "No hay promociones" in promos_texto:
        return "En este momento no disponemos de promociones vigentes. Te invito a ver nuestro menú para conocer todas las opciones."
    return f"¡Acá tenés nuestras promociones vigentes!\n\n{promos_texto}\n\n¿Te gustaría aprovechar alguna?"


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
    pie = (
        f"{PIE_DE_FOTO_PROMOS}\nTambién podés verlas online en: {promotions_link}" if promotions_link else PIE_DE_FOTO_PROMOS
    )
    enviadas = await enviar_imagenes(canal_de_envio, chat_id, imagenes, _leer_bytes, pie, "de promociones")
    if enviadas > 0:
        await enviar_si_hay_link(canal_de_envio, chat_id, promotions_link, f"Promociones online: {promotions_link}")
        return MENSAJE_PROMOS_ENVIADO

    # Sin imágenes (o si no se pudo mandar ninguna), el link solo; y sin link, las promociones de la base.
    mensaje = f"¡Acá podés ver todas nuestras promociones vigentes!\n{promotions_link}\n\n{MENSAJE_PROMOS_ENVIADO}"
    if await enviar_si_hay_link(canal_de_envio, chat_id, promotions_link, mensaje):
        return MENSAJE_PROMOS_ENVIADO
    return _promociones_desde_la_base()
