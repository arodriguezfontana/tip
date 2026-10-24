"""Herramienta del bot para pasar la conversación a una persona del local."""

import logging
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool

from app.db.session import SessionLocal
from app.services.business_hours_service import estado_del_local
from app.services.human_handoff import MENSAJE_DERIVACION, derivaciones

logger = logging.getLogger(__name__)


def _aviso_si_el_local_esta_cerrado() -> str | None:
    """Con el local cerrado no hay quién atienda: se le avisa al cliente en vez de derivarlo.

    Si el local no configuró horarios no se restringe nada (igual que con los pedidos).
    """
    db = SessionLocal()
    try:
        estado = estado_del_local(db)
    except Exception:
        logger.exception("No se pudo consultar el horario del local para derivar la conversación.")
        return None
    finally:
        db.close()
    if not estado.configurado or estado.abierto:
        return None
    aviso = "En este momento el local está cerrado, así que no puedo pasarte con una persona. 🕒"
    if estado.descripcion_proxima_apertura:
        aviso += f" Volvemos a abrir {estado.descripcion_proxima_apertura}."
    return aviso + " Mientras tanto puedo ayudarte con el menú o con un pedido programado."


@tool
def derivar_a_empleado(
    motivo: str = "",
    telegram_chat_id: Annotated[str | None, InjectedToolArg] = None,
    nombre_cliente: Annotated[str | None, InjectedToolArg] = None,
    usuario_telegram: Annotated[str | None, InjectedToolArg] = None,
    telefono_cliente: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Pasa la conversación a una persona del local y el bot deja de responderle al cliente.
    Usala cuando el cliente pide hablar con una persona, un asesor, un empleado o el dueño, o cuando
    prefiere que le tomen el pedido a mano.

    Args:
        motivo: Resumen breve (una frase) de qué necesita el cliente, para que el empleado llegue al tanto.
    """
    if not telegram_chat_id or not telegram_chat_id.lstrip("-").isdigit():
        logger.warning("No se puede derivar la conversación %r: no es un chat de Telegram.", telegram_chat_id)
        return "Por este medio no puedo pasarte con una persona. Podés comunicarte con el local directamente."
    cerrado = _aviso_si_el_local_esta_cerrado()
    if cerrado:
        return cerrado
    derivaciones.solicitar(
        telegram_chat_id,
        cliente=nombre_cliente,
        motivo=(motivo or "").strip()[:300] or None,
        usuario=usuario_telegram,
        telefono=telefono_cliente,
    )
    return MENSAJE_DERIVACION
