"""Tools de LangChain para analizar, calcular y persistir pedidos de forma exacta."""

from datetime import date, datetime, time, timedelta, timezone
import json
import logging
import re
import unicodedata
from typing import Annotated
from langchain_core.tools import tool, InjectedToolArg
from sqlalchemy.orm import Session
from app.core.time import ahora_local
from app.db.session import SessionLocal
from app.modules.menu import Product
from app.modules.order import Order, OrderItem
from app.schemas.common import PHONE_PATTERN
from app.services.business_hours_service import (
    DIAS_SEMANA,
    Franja,
    describir_horarios,
    describir_momento,
    esta_abierto,
    obtener_franjas,
    proxima_apertura,
    proxima_fecha_abierta_a_la_hora,
)
from app.services.order_service import calcular_demora_actual

logger = logging.getLogger(__name__)

# Margen para no rechazar al confirmar un horario que era válido cuando se le propuso al cliente
# y quedó apenas por debajo del mínimo por el tiempo que pasó en la conversación.
TOLERANCIA_CONFIRMACION_MINUTOS = 5

MAX_LARGO_OBSERVACIONES = 500

# Con cuántos días de anticipación se puede programar un pedido.
MAX_DIAS_PROGRAMACION = 7

# Frase del mensaje de éxito de confirmar_y_guardar_pedido: el chat la usa para saber que el pedido se registró.
MARCA_PEDIDO_REGISTRADO = "Recibimos tu pedido"

_PATRON_HORA = re.compile(r"(\d{1,2})(?:\s*[:.h]?\s*(\d{2}))?", re.IGNORECASE)


def _parsear_hora(hora_str: str) -> time | None:
    """Interpreta horarios como '21', '21:30', '21.30hs', '21h30' o '2130'."""
    match = _PATRON_HORA.search(hora_str)
    if not match:
        return None
    horas, minutos = int(match.group(1)), int(match.group(2) or 0)
    if horas > 23 or minutos > 59:
        return None
    return time(horas, minutos)


def _sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def _parsear_dia(dia_str: str, hoy: date) -> date | None:
    """Interpreta 'hoy', 'mañana', 'pasado mañana', un día de la semana, '17/10' o '2026-10-17'."""
    texto = _sin_acentos(dia_str.strip().lower())
    try:
        return date.fromisoformat(texto)
    except ValueError:
        pass
    if "pasado manana" in texto:
        return hoy + timedelta(days=2)
    if "manana" in texto:
        return hoy + timedelta(days=1)
    if "hoy" in texto:
        return hoy
    for numero, nombre in enumerate(DIAS_SEMANA):
        if _sin_acentos(nombre) in texto:
            return hoy + timedelta(days=(numero - hoy.weekday()) % 7)
    match = re.search(r"(\d{1,2})/(\d{1,2})", texto)
    if match:
        try:
            fecha = date(hoy.year, int(match.group(2)), int(match.group(1)))
        except ValueError:
            return None
        return fecha if fecha >= hoy else fecha.replace(year=hoy.year + 1)
    return None


def _texto_horarios(franjas: list[Franja]) -> str:
    return "\n".join(f"- {linea}" for linea in describir_horarios(franjas))


def _aviso_local_cerrado(franjas: list[Franja], ahora: datetime) -> str:
    apertura = proxima_apertura(franjas, ahora)
    vuelve = f" Volvemos a abrir {describir_momento(apertura, ahora, con_fecha=False)}." if apertura else ""
    return (
        f"🔒 En este momento el local está cerrado, así que no podemos prepararlo para ahora.{vuelve}\n\n"
        f"🕒 Nuestros horarios de atención:\n{_texto_horarios(franjas)}\n\n"
        "Si querés, lo programamos para un horario en el que estemos abiertos: ¿para qué día y hora te lo preparamos?"
    )


def describir_horario_programado(programado: datetime | None, ahora: datetime) -> str:
    if programado is None:
        return "para ahora"
    if programado.date() == ahora.date():
        return f"para las {programado:%H:%M}"
    return f"para {describir_momento(programado, ahora)}"


def _telefono_valido(telefono: str | None) -> bool:
    """Mismo criterio que los pedidos de la web y del mostrador."""
    return bool(telefono) and 6 <= len(telefono) <= 30 and re.match(PHONE_PATTERN, telefono) is not None


def _limpiar_observaciones(observaciones: str | None) -> str | None:
    texto = (observaciones or "").strip()
    return texto[:MAX_LARGO_OBSERVACIONES] or None


def _items_con_precios_de_la_base(db: Session, items: list) -> tuple[list[OrderItem], float] | str:
    """Arma los ítems del pedido con los precios actuales de la base, sin confiar en los que mande el modelo.

    Devuelve los ítems y el total, o el motivo por el que el pedido no se puede registrar.
    """
    cantidades: dict[int, int] = {}
    try:
        for item in items:
            product_id, cantidad = int(item["product_id"]), int(item.get("quantity") or 1)
            if cantidad < 1:
                return "Hay una cantidad inválida en el pedido."
            cantidades[product_id] = cantidades.get(product_id, 0) + cantidad
    except (KeyError, TypeError, ValueError, AttributeError):
        return "No pude identificar los productos del pedido."
    if not cantidades:
        return "El pedido no tiene productos."

    productos = {p.id: p for p in db.query(Product).filter(Product.id.in_(cantidades.keys())).all()}
    if any(pid not in productos or not productos[pid].is_active for pid in cantidades):
        return "Algunos productos del pedido ya no están disponibles en el menú."

    order_items = [
        OrderItem(product_id=pid, quantity=cantidad, unit_price=productos[pid].price)
        for pid, cantidad in cantidades.items()
    ]
    total = sum(item.unit_price * item.quantity for item in order_items)
    return order_items, total


def _redondear_al_minuto_siguiente(momento: datetime) -> datetime:
    redondeado = momento.replace(second=0, microsecond=0)
    return redondeado if redondeado == momento else redondeado + timedelta(minutes=1)


def _evaluar_hora_programada(
    db: Session, hora_str: str | None, dia_str: str | None = None, tolerancia_minutos: int = 0
) -> tuple[datetime | None, str | None]:
    """Interpreta el horario pedido en la zona horaria del local y verifica que se pueda cumplir:
    que el local esté abierto a esa hora y que se llegue a preparar con la demora actual.

    Devuelve el horario programado (None si el pedido es para ahora) o, si no se puede cumplir,
    el mensaje a transmitirle al cliente.
    """
    ahora = ahora_local()
    franjas = obtener_franjas(db)

    if not hora_str or not re.search(r"\d", hora_str):
        if not esta_abierto(franjas, ahora):
            return None, _aviso_local_cerrado(franjas, ahora)
        return None, None

    hora = _parsear_hora(hora_str)
    if hora is None:
        return None, f"No entendí el horario '{hora_str}'. ¿Me lo indicás como HH:MM (por ejemplo, 21:30)?"

    if dia_str and dia_str.strip():
        fecha = _parsear_dia(dia_str, ahora.date())
        if fecha is None:
            return None, (
                f"No entendí para qué día es el pedido ('{dia_str}'). "
                "¿Me lo indicás (por ejemplo, hoy, mañana o el sábado)?"
            )
        solicitado = datetime.combine(fecha, hora, tzinfo=ahora.tzinfo)
    else:
        solicitado = datetime.combine(ahora.date(), hora, tzinfo=ahora.tzinfo)
        # Sin día indicado, si hoy a esa hora el local no abre (o ya pasó y ahora está cerrado),
        # se toma el próximo día en que sí abre a esa hora (ej. a la noche, "para las 13" es mañana).
        if not esta_abierto(franjas, solicitado) or (solicitado < ahora and not esta_abierto(franjas, ahora)):
            solicitado = proxima_fecha_abierta_a_la_hora(
                franjas, ahora.date(), hora, ahora.tzinfo, MAX_DIAS_PROGRAMACION
            ) or solicitado

    if solicitado.date() > ahora.date() + timedelta(days=MAX_DIAS_PROGRAMACION):
        return None, f"Solo podemos programar pedidos con hasta {MAX_DIAS_PROGRAMACION} días de anticipación."

    if not esta_abierto(franjas, solicitado):
        return None, (
            f"El local está cerrado {describir_momento(solicitado, ahora)}, "
            "así que no podemos programarlo para ese horario.\n\n"
            f"🕒 Nuestros horarios de atención:\n{_texto_horarios(franjas)}\n\n"
            "¿Para qué otro horario querés programarlo?"
        )

    demora = calcular_demora_actual(db)
    horario_mas_temprano = _redondear_al_minuto_siguiente(ahora + timedelta(minutes=demora))

    if solicitado + timedelta(minutes=tolerancia_minutos) < horario_mas_temprano:
        if not esta_abierto(franjas, ahora) or not esta_abierto(franjas, horario_mas_temprano):
            # Lo más rápido posible cae fuera del horario: no se puede ofrecer ni esa hora ni "para ahora".
            return None, (
                f"Con la demora actual (unos {demora} minutos) no llegamos a tenerlo a las {solicitado:%H:%M}. "
                "¿Para qué otro horario querés programarlo?"
            )
        return None, (
            f"Con la demora actual (unos {demora} minutos), lo más rápido que podemos tener tu pedido "
            f"es a las {horario_mas_temprano:%H:%M}. ¿Querés programarlo para esa hora o preferís pedirlo para ahora?"
        )
    return solicitado, None


@tool
def calcular_y_preparar_pedido(
    items_solicitados: str,
    customer_name: str | None = None,
    customer_phone: str | None = None,
    shipping_address: str | None = None,
    metodo_entrega: str | None = None,
    hora_programada: str | None = None,
    dia_programado: str | None = None,
    observaciones: str | None = None,
) -> str:
    """Calcula de forma exacta el total de un pedido consultando los precios reales.

    Args:
        items_solicitados: Los productos y cantidades pedidos (ej: "2 Pizza Muzzarella, 1 Coca-Cola").
        customer_name: Nombre del cliente.
        customer_phone: Teléfono de contacto del cliente.
        shipping_address: Dirección de envío (solo para envíos a domicilio).
        metodo_entrega: "retiro" o "domicilio".
        hora_programada: Hora para la que se programa el pedido (ej: "21:00"); vacío si es para ahora.
        dia_programado: Día para el que se programa el pedido, solo si el cliente lo indicó (ej: "mañana",
            "sábado", "17/10"); vacío si no dijo el día.
        observaciones: Aclaraciones del cliente sobre la comida o la entrega (ej: "sin cebolla",
            "timbre 2B", "paga con $20000"). Incluí cualquier aclaración de este tipo que el cliente
            haya mencionado en cualquier momento de la conversación, aunque no se la hayas preguntado.
    """
    db = SessionLocal()
    try:
        lista_items = []
        
        try:
            parsed = json.loads(items_solicitados)
            if isinstance(parsed, list):
                lista_items = parsed
            elif isinstance(parsed, dict):
                lista_items = [parsed]
        except Exception:
            partes = items_solicitados.split(",")
            for parte in partes:
                parte_limpia = parte.strip()
                match_num = re.search(r'^(\d+)\s*(?:x|-)?\s*(.+)$', parte_limpia)
                if match_num:
                    cant = int(match_num.group(1))
                    nombre = match_num.group(2).strip()
                    lista_items.append({"nombre": nombre, "cantidad": cant})
                else:
                    lista_items.append({"nombre": parte_limpia, "cantidad": 1})

        resumen_lineas = []
        total_general = 0.0
        items_validados = []

        for item in lista_items:
            nombre_buscado = str(item.get("nombre", "")).strip()
            cantidad = int(item.get("cantidad") or item.get("quantity") or 1)

            if not nombre_buscado:
                continue

            producto = db.query(Product).filter(
                Product.is_active.is_(True),
                Product.name.ilike(f"%{nombre_buscado}%")
            ).first()

            if not producto:
                resumen_lineas.append(f"- No pudimos encontrar el producto: '{nombre_buscado}'")
                continue

            subtotal = producto.price * cantidad
            total_general += subtotal
            resumen_lineas.append(f"- {producto.name} (x{cantidad}) ${subtotal:,.2f}")
            items_validados.append({
                "product_id": producto.id,
                "nombre": producto.name,
                "quantity": cantidad,
                "unit_price": producto.price
            })

        if not items_validados:
            return "No se pudieron reconocer productos válidos en el menú para tu pedido."

        es_retiro = metodo_entrega == "retiro"
        falta_direccion = not es_retiro and not shipping_address
        telefono = (customer_phone or "").strip()
        falta_telefono = not _telefono_valido(telefono)
        notas = _limpiar_observaciones(observaciones)
        faltan_datos = metodo_entrega is None or not customer_name or falta_telefono or falta_direccion

        horario_programado, aviso_horario = _evaluar_hora_programada(db, hora_programada, dia_programado)

        resultado_json = {
            "items": items_validados,
            "total": total_general,
            "cliente": customer_name,
            "telefono": telefono or None,
            "direccion": "Retiro en el local" if es_retiro else shipping_address,
            "metodo_entrega": metodo_entrega,
            "hora_programada": f"{horario_programado:%H:%M}" if horario_programado else None,
            "dia_programado": f"{horario_programado:%Y-%m-%d}" if horario_programado else None,
            "observaciones": notas,
            "faltan_datos": faltan_datos or aviso_horario is not None,
        }

        texto_respuesta = "Queremos confirmar tu pedido:\n" + "\n".join(resumen_lineas) + f"\n\nTotal: ${total_general:,.2f}"

        if faltan_datos:
            faltantes = []
            if metodo_entrega is None:
                faltantes.append("si retirás por el local o te lo enviamos a domicilio")
            if not customer_name:
                faltantes.append("tu nombre")
            if falta_telefono:
                faltantes.append("un teléfono de contacto válido" if telefono else "un teléfono de contacto")
            if falta_direccion:
                faltantes.append("tu dirección de envío")
            texto_respuesta += f"\n\n(Me falta que me digas {', '.join(faltantes)} para continuar)."
            if aviso_horario:
                texto_respuesta += f"\n\n{aviso_horario}"
        elif aviso_horario:
            texto_respuesta = aviso_horario
        else:
            entrega = "Retiro en el local" if es_retiro else f"Envío a domicilio: {shipping_address}"
            horario = describir_horario_programado(horario_programado, ahora_local())
            texto_respuesta = "\n".join([
                "📝 Resumen de tu pedido",
                "",
                "🛒 Productos:",
                *resumen_lineas,
                f"💰 Total: ${total_general:,.2f}",
                "",
                "🚚 Entrega:",
                f"- Nombre: {customer_name}",
                f"- Teléfono: {telefono}",
                f"- {entrega}",
                f"- Horario: {horario}",
                f"- Observaciones: {notas or 'sin observaciones'}",
                "",
                "¿Está todo bien para confirmar el pedido?",
            ])
        return json.dumps({"mensaje_para_usuario": texto_respuesta, "datos_temporales": resultado_json}, ensure_ascii=False)

    except Exception as e:
        logger.exception("Error procesando el cálculo del pedido. items_solicitados=%s", items_solicitados)
        return f"Error procesando el cálculo: {str(e)}"
    finally:
        db.close()


@tool
def confirmar_y_guardar_pedido(
    datos_pedido_json: str,
    telegram_chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Persiste definitivamente la orden en la base de datos con estado 'Pendiente'.
    Se ejecuta únicamente cuando el usuario confirma explícitamente con un 'Sí'.

    Args:
        datos_pedido_json: El objeto JSON con los items, total, nombre y dirección validados previamente.
    """
    db = SessionLocal()
    try:
        datos = json.loads(datos_pedido_json)

        raw_delivery = str(datos.get("metodo_entrega", "domicilio")).lower()
        if "retiro" in raw_delivery or "local" in raw_delivery:
            delivery_method = "retiro"
        else:
            delivery_method = "domicilio"
            
        es_retiro = delivery_method == "retiro"

        cliente = datos.get("cliente") or datos.get("customer_name") or "Cliente"
        direccion = datos.get("direccion") or datos.get("shipping_address")
        telefono = str(datos.get("telefono") or datos.get("customer_phone") or "").strip()

        if not cliente or (not es_retiro and not direccion):
            return "Faltan datos obligatorios (nombre o dirección) para registrar la orden."
        if not _telefono_valido(telefono):
            return "El pedido NO se registró todavía: falta un teléfono de contacto válido del cliente."

        scheduled_dt, aviso_horario = _evaluar_hora_programada(
            db,
            datos.get("hora_programada"),
            datos.get("dia_programado"),
            tolerancia_minutos=TOLERANCIA_CONFIRMACION_MINUTOS,
        )
        if aviso_horario:
            return f"El pedido NO se registró todavía. {aviso_horario}"

        # Los precios y el total salen siempre de la base: nunca de lo que haya armado el modelo.
        items_y_total = _items_con_precios_de_la_base(db, datos.get("items") or [])
        if isinstance(items_y_total, str):
            return f"El pedido NO se registró todavía. {items_y_total}"
        order_items, total = items_y_total

        nueva_orden = Order(
            customer_name=cliente,
            shipping_address="Retiro en el local" if es_retiro else (direccion or "Sin especificar"),
            customer_phone=telefono,
            notes=_limpiar_observaciones(datos.get("observaciones") or datos.get("notes")),
            total_amount=total,
            status="Pendiente",
            delivery_method=delivery_method,
            telegram_chat_id=telegram_chat_id,
            scheduled_for=scheduled_dt.astimezone(timezone.utc) if scheduled_dt else None,
        )
        nueva_orden.items = order_items
        db.add(nueva_orden)
        db.commit()
        
        horario_texto = f" {describir_horario_programado(scheduled_dt, ahora_local())}" if scheduled_dt else ""
        return (
            f"¡Listo, {cliente}! 🙌 {MARCA_PEDIDO_REGISTRADO}{horario_texto}.\n\n"
            "⏳ Todavía no está confirmado: el local lo va a revisar y en breve te vamos a escribir "
            "por este chat para confirmártelo junto con el tiempo estimado.\n\n"
            "¡Muchas gracias por elegirnos!"
        )
    except Exception as e:
        db.rollback()
        logger.exception("Error al guardar la orden. datos_pedido_json=%s", datos_pedido_json)
        return f"Error al procesar el registro del pedido. Por favor, intentá nuevamente."
    finally:
        db.close()