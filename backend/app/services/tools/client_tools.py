"""Herramienta del bot para guardar en la agenda el nombre de un cliente nuevo (US-38)."""

import logging
import re
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.core.channels import Channel
from app.db.session import SessionLocal, transaction
from app.services import client_service

logger = logging.getLogger(__name__)

MAX_LARGO_NOMBRE = 60
# Frase del mensaje de éxito: el chat la usa para saber que el nombre quedó guardado.
MARCA_NOMBRE_GUARDADO = "Un gusto"
MENSAJE_NOMBRE_NO_ENTENDIDO = "No llegué a entender tu nombre. ¿Me lo repetís, por favor?"


def limpiar_nombre(nombre: str | None) -> str | None:
    """Nombre apto para guardarlo: solo letras, espacios y . ' - (sin números, símbolos ni emojis).

    Se guarda en el perfil y vuelve a aparecer en las instrucciones del bot en cada charla: por eso no se
    admite cualquier texto que escriba el cliente.
    """
    texto = re.sub(r"[\d_]|[^\w\s.'’-]", "", str(nombre or ""))
    texto = re.sub(r"\s+", " ", texto).strip()[:MAX_LARGO_NOMBRE].strip()
    return texto if len(texto) >= 2 else None


@tool
def guardar_nombre_del_cliente(
    nombre: str,
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Guarda el nombre de un cliente nuevo en su perfil, para reconocerlo la próxima vez. Usala apenas el cliente
    te diga su nombre, cuando la memoria indique "CLIENTE NUEVO". La herramienta responde por vos.

    Args:
        nombre: El nombre que dijo el cliente (solo el nombre, ej: "Carlos").
    """
    limpio = limpiar_nombre(nombre)
    if limpio is None:
        return MENSAJE_NOMBRE_NO_ENTENDIDO

    # El teléfono que identifica al cliente es el de su WhatsApp: en otros canales no hay perfil que guardar.
    if canal == Channel.WHATSAPP and chat_id:
        db = SessionLocal()
        try:
            with transaction(db):
                client_service.upsert_client(db, chat_id, limpio, None)
        except Exception:
            logger.exception("No se pudo guardar el nombre del cliente del chat %s", chat_id)
        finally:
            db.close()

    return f"¡{MARCA_NOMBRE_GUARDADO}, {limpio}! 😊 ¿Querés ver el menú o preferís hacer un pedido directamente?"
