"""Estado y horarios de atención del local para el chatbot.

Igual que el menú, se incluye en las instrucciones del modelo en cada mensaje, así el bot sabe si el
local está abierto desde el saludo sin necesitar una llamada extra a una herramienta.
"""

import logging

from app.db.session import SessionLocal
from app.services.business_hours_service import DIAS_SEMANA, describir_horarios, estado_del_local

logger = logging.getLogger(__name__)


def obtener_estado_del_local() -> str:
    """Bloque de instrucciones con la fecha y hora actual, los horarios y si el local está abierto.

    Vacío si el local no configuró horarios (en ese caso no se restringen los pedidos).
    """
    db = SessionLocal()
    try:
        estado = estado_del_local(db)
        if not estado.configurado:
            return ""

        ahora = estado.ahora
        lineas = [
            f"FECHA Y HORA ACTUAL DEL LOCAL: {DIAS_SEMANA[ahora.weekday()]} {ahora:%d/%m/%Y %H:%M}.",
            "HORARIOS DE ATENCIÓN:",
            *(f"- {linea}" for linea in describir_horarios(estado.franjas)),
        ]
        if estado.abierto:
            cierre = f" (cierra a las {estado.cierra_a:%H:%M})" if estado.cierra_a else ""
            lineas.append(f"ESTADO DEL LOCAL: ABIERTO{cierre}.")
        else:
            lineas += [
                f"ESTADO DEL LOCAL: CERRADO. Vuelve a abrir {estado.descripcion_proxima_apertura}.",
                "REGLA DE LOCAL CERRADO: En tu primera respuesta (aunque sea solo un saludo) informale al cliente "
                "que el local está cerrado en este momento, cuándo vuelve a abrir y los horarios de atención, y "
                "aclarale que igual puede programar un pedido para un horario en el que el local esté abierto. "
                "No tomes pedidos para ahora: pedile el día y la hora para programarlo.",
            ]
        return "\n".join(lineas)
    except Exception:
        logger.exception("No se pudo obtener el horario del local para el chatbot.")
        return ""
    finally:
        db.close()
