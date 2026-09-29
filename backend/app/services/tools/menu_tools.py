"""Menú real del local para el chatbot.

Se incluye directamente en las instrucciones del modelo en cada mensaje (en vez de exponerlo como
herramienta), así mostrar el menú no requiere una llamada extra a Gemini.
"""

import logging

from app.db.session import SessionLocal
from app.modules.menu import Product

logger = logging.getLogger(__name__)


def obtener_menu_actual() -> str:
    """Listado de productos activos (nombre, precio y categoría), tal como están cargados en la base."""
    db = SessionLocal()
    try:
        productos = (
            db.query(Product)
            .filter(Product.is_active.is_(True))
            .order_by(Product.category_id, Product.name)
            .all()
        )
        if not productos:
            return "No hay productos disponibles en este momento."
        return "\n".join(f"- {p.name} (${p.price:,.2f}) [{p.category.name}]" for p in productos)
    except Exception:
        logger.exception("No se pudo cargar el menú para el chatbot.")
        return "No se pudo cargar el menú en este momento."
    finally:
        db.close()
