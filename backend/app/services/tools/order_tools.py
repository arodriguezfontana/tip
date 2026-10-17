"""Tools de LangChain para analizar, calcular y persistir pedidos de forma exacta.

Son la "capa de entrada" del bot (como los routers para la API): interpretan lo que arma el modelo de
lenguaje y le devuelven textos para el cliente, pero las reglas del pedido y el acceso a la base quedan en
los servicios y el modelo, iguales para todos los canales.
"""

import json
import logging
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool
from sqlalchemy.orm import Session

from app.core.time import ahora_local
from app.db.session import SessionLocal
from app.models.menu import Product
from app.models.order import PICKUP_ADDRESS, DeliveryMethod, InvalidOrderError, PaymentMethod
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
from app.services.catalog_service import find_available_products_by_name
from app.services.mercadopago_service import create_payment_preference
from app.services.order_service import OrderRequest, ScheduleTooEarlyError, create_bot_order, validate_schedule
from app.services.store_config_service import get_or_create_store_config

logger = logging.getLogger(__name__)


def _normalizar_metodo_pago(metodo: str | None) -> str | None:
    if not metodo:
        return None
    texto = _sin_acentos(str(metodo).strip().lower())
    if any(k in texto for k in ("mercado", "mp", "link", "digital")):
        return PaymentMethod.MERCADOPAGO.value
    if any(k in texto for k in ("efectivo", "cash", "pesos")):
        return PaymentMethod.CASH.value
    return None

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


def _items_del_modelo(items: list) -> list[tuple[int, int]] | None:
    """(product_id, cantidad) de cada ítem que armó el modelo, o None si no se pueden interpretar.

    Solo se toman los ids y las cantidades: los precios y el total los calcula siempre el pedido con los
    de la base, nunca con lo que haya armado el modelo.
    """
    try:
        return [(int(item["product_id"]), int(item.get("quantity") or 1)) for item in items]
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def _buscar_producto(db: Session, nombre: str) -> Product | list[Product] | None:
    """Producto que corresponde al nombre que escribió el cliente: uno solo, la lista de candidatos si el
    nombre es ambiguo (para preguntarle cuál quiso, en vez de elegir uno al azar) o None."""
    candidatos = find_available_products_by_name(db, nombre)
    if not candidatos:
        return None
    return candidatos[0] if len(candidatos) == 1 else candidatos


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

    try:
        validate_schedule(db, solicitado, now=ahora, tolerance_minutes=tolerancia_minutos)
    except ScheduleTooEarlyError as exc:
        if not esta_abierto(franjas, ahora) or not esta_abierto(franjas, exc.earliest):
            # Lo más rápido posible cae fuera del horario: no se puede ofrecer ni esa hora ni "para ahora".
            return None, (
                f"Con la demora actual (unos {exc.delay_minutes} minutos) no llegamos a tenerlo a las "
                f"{solicitado:%H:%M}. ¿Para qué otro horario querés programarlo?"
            )
        return None, (
            f"Con la demora actual (unos {exc.delay_minutes} minutos), lo más rápido que podemos tener tu pedido "
            f"es a las {exc.earliest:%H:%M}. ¿Querés programarlo para esa hora o preferís pedirlo para ahora?"
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
    metodo_pago: str | None = None,
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
        metodo_pago: "efectivo" o "mercadopago". Si el cliente indicó cómo desea abonar, pasalo acá.
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
        total_general = Decimal(0)
        items_validados = []
        hay_ambiguos = False

        for item in lista_items:
            nombre_buscado = str(item.get("nombre", "")).strip()
            cantidad = int(item.get("cantidad") or item.get("quantity") or 1)

            if not nombre_buscado:
                continue

            producto = _buscar_producto(db, nombre_buscado)

            if not producto:
                resumen_lineas.append(f"- No pudimos encontrar el producto: '{nombre_buscado}'")
                continue
            if isinstance(producto, list):
                hay_ambiguos = True
                opciones = ", ".join(p.name for p in producto)
                resumen_lineas.append(f"- '{nombre_buscado}' puede ser: {opciones}. ¿Cuál querés?")
                continue

            subtotal = producto.price * cantidad
            total_general += subtotal
            resumen_lineas.append(f"- {producto.name} (x{cantidad}) ${subtotal:,.2f}")
            items_validados.append({
                "product_id": producto.id,
                "nombre": producto.name,
                "quantity": cantidad,
                "unit_price": float(producto.price),
            })

        if not items_validados:
            if hay_ambiguos:
                return "Necesito que me aclares algunos productos:\n" + "\n".join(resumen_lineas)
            return "No se pudieron reconocer productos válidos en el menú para tu pedido."

        es_retiro = metodo_entrega == DeliveryMethod.PICKUP
        falta_direccion = not es_retiro and not shipping_address
        telefono = (customer_phone or "").strip()
        falta_telefono = not _telefono_valido(telefono)
        notas = _limpiar_observaciones(observaciones)
        pago_normalizado = _normalizar_metodo_pago(metodo_pago)
        faltan_datos = (
            metodo_entrega is None or not customer_name or falta_telefono or falta_direccion or hay_ambiguos
        )

        horario_programado, aviso_horario = _evaluar_hora_programada(db, hora_programada, dia_programado)

        resultado_json = {
            "items": items_validados,
            "total": float(total_general),
            "cliente": customer_name,
            "telefono": telefono or None,
            "direccion": PICKUP_ADDRESS if es_retiro else shipping_address,
            "metodo_entrega": metodo_entrega,
            "hora_programada": f"{horario_programado:%H:%M}" if horario_programado else None,
            "dia_programado": f"{horario_programado:%Y-%m-%d}" if horario_programado else None,
            "observaciones": notas,
            "metodo_pago": pago_normalizado,
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
            if hay_ambiguos:
                faltantes.append("cuál de los productos que te consulté arriba querés")
            texto_respuesta += f"\n\n(Me falta que me digas {', '.join(faltantes)} para continuar)."
            if aviso_horario:
                texto_respuesta += f"\n\n{aviso_horario}"
        elif aviso_horario:
            texto_respuesta = aviso_horario
        else:
            entrega = PICKUP_ADDRESS if es_retiro else f"Envío a domicilio: {shipping_address}"
            horario = describir_horario_programado(horario_programado, ahora_local())

            if pago_normalizado:
                pago_label = "MercadoPago" if pago_normalizado == PaymentMethod.MERCADOPAGO.value else "Efectivo"
                pago_linea = f"- Método de pago: {pago_label}"
                pregunta_final = "¿Está todo bien para confirmar el pedido?"
            else:
                pago_linea = '💳 Método de pago: ¿Qué método de pago preferís? Ofrecemos "Efectivo" y "MercadoPago".'
                pregunta_final = "¿Está todo bien para confirmar el pedido?"

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
                *( [pago_linea] if pago_normalizado else [] ),
                "",
                *( [pago_linea, ""] if not pago_normalizado else [] ),
                pregunta_final,
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
            delivery_method = DeliveryMethod.PICKUP
        else:
            delivery_method = DeliveryMethod.DELIVERY
        es_retiro = delivery_method == DeliveryMethod.PICKUP

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

        items = _items_del_modelo(datos.get("items") or [])
        if items is None:
            return "El pedido NO se registró todavía. No pude identificar los productos del pedido."

        raw_pago = datos.get("metodo_pago") or datos.get("payment_method")
        metodo_pago = _normalizar_metodo_pago(raw_pago) or PaymentMethod.CASH.value

        pedido = OrderRequest(
            customer_name=cliente,
            customer_phone=telefono,
            delivery_method=delivery_method,
            shipping_address=None if es_retiro else direccion,
            notes=_limpiar_observaciones(datos.get("observaciones") or datos.get("notes")),
            items=items,
        )
        # Mismas reglas que los pedidos de la web y del mostrador (disponibilidad, máximo por producto, precios).
        try:
            order = create_bot_order(
                db,
                pedido,
                telegram_chat_id=telegram_chat_id,
                scheduled_for=scheduled_dt.astimezone(timezone.utc) if scheduled_dt else None,
                payment_method=metodo_pago,
            )
        except InvalidOrderError as exc:
            return f"El pedido NO se registró todavía. {exc}"

        horario_texto = f" {describir_horario_programado(scheduled_dt, ahora_local())}" if scheduled_dt else ""

        if metodo_pago == PaymentMethod.MERCADOPAGO.value:
            store_config = get_or_create_store_config(db)
            pref = create_payment_preference(order, store_name=store_config.store_name)
            order.mp_preference_id = pref.get("preference_id")
            db.commit()

            link_pago_texto = (
                f"\n\n💳 Link de pago de MercadoPago por el total exacto de ${order.total_amount:,.2f}:\n"
                f"{pref['init_point']}\n"
                "(Ingresá al link para abonar tu pedido de forma digital)"
            )
            if store_config.mp_alias:
                link_pago_texto += f"\nAlias de cobro: {store_config.mp_alias}"

            return (
                f"¡Listo, {cliente}! 🙌 {MARCA_PEDIDO_REGISTRADO}{horario_texto}.\n\n"
                f"Método de pago: MercadoPago.{link_pago_texto}\n\n"
                "⏳ Todavía no está confirmado: el local lo va a revisar y en breve te vamos a escribir "
                "por este chat para confirmártelo junto con el tiempo estimado.\n\n"
                "¡Muchas gracias por elegirnos!"
            )

        return (
            f"¡Listo, {cliente}! 🙌 {MARCA_PEDIDO_REGISTRADO}{horario_texto}.\n\n"
            "Método de pago: Efectivo (abonás al recibir o retirar tu pedido).\n\n"
            "⏳ Todavía no está confirmado: el local lo va a revisar y en breve te vamos a escribir "
            "por este chat para confirmártelo junto con el tiempo estimado.\n\n"
            "¡Muchas gracias por elegirnos!"
        )
    except Exception:
        # Si el error ocurrió al guardar, el servicio ya deshizo la transacción.
        logger.exception("Error al guardar la orden. datos_pedido_json=%s", datos_pedido_json)
        return "Error al procesar el registro del pedido. Por favor, intentá nuevamente."
    finally:
        db.close()
