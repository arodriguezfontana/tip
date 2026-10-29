"""Tools de LangChain para analizar, calcular y persistir pedidos de forma exacta.

Son la "capa de entrada" del bot (como los routers para la API): interpretan lo que arma el modelo de
lenguaje y le devuelven textos para el cliente, pero las reglas del pedido y el acceso a la base quedan en
los servicios y el modelo, iguales para todos los canales.
"""

import json
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool
from sqlalchemy.orm import Session

from app.core.channels import Channel
from app.core.money import to_money
from app.core.phone import normalize_phone
from app.core.time import ahora_local
from app.db.session import SessionLocal
from app.models.menu import Product
from app.models.order import MAX_QUANTITY_PER_ITEM, PICKUP_ADDRESS, DeliveryMethod, InvalidOrderError, PaymentMethod
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
from app.services.modifier_nlp import (
    extraer_modificadores_de_texto,
    vincular_modificadores_con_db,
)
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
MAX_ITEMS_EN_PEDIDO = 50
MAX_LARGO_CLIENTE = 100
MAX_LARGO_DIRECCION = 255

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


def _items_del_modelo(items: list) -> list[tuple] | None:
    """(product_id, cantidad, secondary_product_id, custom_name, modifications) de cada ítem que armó el modelo, o None si no se pueden interpretar.

    Solo se toman los ids y las cantidades: los precios y el total los calcula siempre el pedido con los
    de la base, nunca con lo que haya armado el modelo.
    """
    try:
        resultado = []
        for item in items:
            p_id = int(item["product_id"])
            qty = int(item.get("quantity") or 1)
            sec_id = int(item["secondary_product_id"]) if item.get("secondary_product_id") is not None else None
            custom_name = str(item["nombre"]) if (item.get("nombre") and sec_id is not None) else None
            mods = list(item.get("modifications") or item.get("modificaciones") or [])
            resultado.append((p_id, qty, sec_id, custom_name, mods))
        return resultado
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def clean_pizza_flavor(product_name: str) -> str:
    """Extrae el gusto de la pizza limpio (ej: 'Pizza Muzzarella' -> 'Muzzarella')."""
    nombre = product_name.strip()
    nombre = re.sub(r'^(?:pizza(?:s)?\s+)?(?:de\s+)?', '', nombre, flags=re.IGNORECASE)
    nombre = re.sub(r'(?:\s+(?:grande|chica|individual))$', '', nombre, flags=re.IGNORECASE)
    return nombre.strip().title()


def format_half_and_half_name(p1_name: str, p2_name: str, size_hint: str = "") -> str:
    """Formatea el nombre unificado de la pizza mitad y mitad (ej: 'Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]')."""
    f1 = clean_pizza_flavor(p1_name)
    f2 = clean_pizza_flavor(p2_name)
    hint = (size_hint or "").lower()
    p1_lower = p1_name.lower()
    p2_lower = p2_name.lower()
    if "grande" in hint or "grande" in p1_lower or "grande" in p2_lower:
        base = "Pizza Grande"
    elif "chica" in hint or "chica" in p1_lower or "chica" in p2_lower:
        base = "Pizza Chica"
    else:
        base = "Pizza"
    return f"{base} [1/2 {f1} | 1/2 {f2}]"


def _buscar_sabor_pizza(db: Session, sabor: str, size_hint: str = "") -> Product | list[Product] | None:
    sabor_limpio = re.sub(r'^(?:pizza(?:s)?\s+)?(?:de\s+)?', '', sabor.strip(), flags=re.IGNORECASE).strip()
    if not sabor_limpio:
        return None

    candidatos = find_available_products_by_name(db, sabor_limpio)
    if not candidatos:
        candidatos = find_available_products_by_name(db, f"pizza {sabor_limpio}")
    if not candidatos:
        return None

    if len(candidatos) == 1:
        return candidatos[0]

    pizzas = [
        p for p in candidatos
        if (p.category and (p.category.name.lower() == "pizzas" or getattr(p.category, "sector", "") == "pizzeria"))
        or "pizza" in p.name.lower()
    ]
    pool = pizzas if pizzas else candidatos

    if len(pool) == 1:
        return pool[0]

    if size_hint and "grande" in size_hint.lower():
        grandes = [p for p in pool if "grande" in p.name.lower()]
        if len(grandes) == 1:
            return grandes[0]
        if len(grandes) > 1:
            return grandes

    if size_hint and "chica" in size_hint.lower():
        chicas = [p for p in pool if "chica" in p.name.lower()]
        if len(chicas) == 1:
            return chicas[0]
        if len(chicas) > 1:
            return chicas

    sin_tamano = [p for p in pool if "grande" not in p.name.lower() and "chica" not in p.name.lower()]
    if len(sin_tamano) == 1:
        return sin_tamano[0]

    return pool


def _detectar_mitad_y_mitad(item: dict) -> tuple[bool, str, str, str, int]:
    sabor1 = item.get("sabor1") or item.get("gusto1")
    sabor2 = item.get("sabor2") or item.get("gusto2")
    raw_cant = item.get("cantidad") if item.get("cantidad") is not None else item.get("quantity")
    try:
        cantidad = int(raw_cant) if raw_cant is not None else 1
    except (ValueError, TypeError):
        cantidad = 1
    size_hint = str(item.get("tamanio") or item.get("size") or "")

    if sabor1 and sabor2:
        return True, str(sabor1).strip(), str(sabor2).strip(), size_hint, cantidad

    nombre = str(item.get("nombre", "")).strip()
    if not nombre:
        return False, "", "", "", cantidad

    # Formato unificado [1/2 Sabor1 | 1/2 Sabor2]
    match_corchetes = re.search(r'^(.*?)\s*\[\s*1/2\s+(.*?)\s*\|\s*1/2\s+(.*?)\s*\]$', nombre, re.IGNORECASE)
    if match_corchetes:
        prefix = match_corchetes.group(1).strip()
        s1 = match_corchetes.group(2).strip()
        s2 = match_corchetes.group(3).strip()
        if "grande" in prefix.lower():
            size_hint = "grande"
        elif "chica" in prefix.lower():
            size_hint = "chica"
        return True, s1, s2, size_hint, cantidad

    # Formato lenguaje natural: "mitad X, mitad Y" o "1/2 X y 1/2 Y" o "media X / media Y"
    match_natural = re.search(
        r'^(.*?)\s*(?:mitad|1/2|media)\s+(?:de\s+)?(.*?)\s*(?:,|y|\/|\||-|\s+)\s*(?:mitad|1/2|media)\s+(?:de\s+)?(.*?)$',
        nombre,
        re.IGNORECASE,
    )
    if match_natural:
        prefix = match_natural.group(1).strip()
        s1 = match_natural.group(2).strip().rstrip(' ,;/|[]')
        s2 = match_natural.group(3).strip().rstrip(' ,;/|[]')
        if "grande" in prefix.lower():
            size_hint = "grande"
        elif "chica" in prefix.lower():
            size_hint = "chica"
        match_qty = re.search(r'^(\d+)', prefix)
        if match_qty:
            cantidad = int(match_qty.group(1))
        return True, s1, s2, size_hint, cantidad

    return False, "", "", "", cantidad


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


@dataclass
class ItemsResueltos:
    """Productos que pidió el cliente, ya buscados en el menú con los precios de la base."""

    validados: list[dict] = field(default_factory=list)
    resumen: list[str] = field(default_factory=list)
    total: Decimal = Decimal(0)
    hay_ambiguos: bool = False
    hay_cantidades_invalidas: bool = False

    def mensaje_sin_items(self) -> str:
        """Qué decirle al cliente cuando no se pudo reconocer ningún producto."""
        if self.hay_ambiguos:
            return "Necesito que me aclares algunos productos:\n" + "\n".join(self.resumen)
        if self.hay_cantidades_invalidas:
            return "Necesito que revises algunos productos del pedido:\n" + "\n".join(self.resumen)
        return "No se pudieron reconocer productos válidos en el menú para tu pedido."


def _resolver_items(db: Session, items_solicitados: str) -> ItemsResueltos:
    """Interpreta lo que pidió el cliente ("2 Pizza Muzzarella, 1 Coca-Cola" o una lista JSON) y lo busca en el menú."""
    resumen_lineas = []
    total_general = Decimal(0)
    items_validados = []
    hay_ambiguos = False
    hay_cantidades_invalidas = False

    lista_items = []

    try:
        parsed = json.loads(items_solicitados)
        if isinstance(parsed, list):
            lista_items = parsed
        elif isinstance(parsed, dict):
            lista_items = [parsed]
    except Exception:
        # Si contiene "mitad X, mitad Y" o "1/2 X, 1/2 Y", normalizamos la coma para que no se separe la pizza mitad y mitad.
        texto_norm = re.sub(r',\s*(?=(?:mitad|1/2|media)\b)', ' y ', items_solicitados, flags=re.IGNORECASE)
        partes = texto_norm.split(",")
        palabras_cant = {"un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5}
        for parte in partes:
            parte_limpia = parte.strip()
            if not parte_limpia:
                continue
            match_num = re.search(r'^(\d+)\s*(?:x|-)?\s*(.+)$', parte_limpia, re.IGNORECASE)
            if match_num:
                cant = int(match_num.group(1))
                nombre = match_num.group(2).strip()
                lista_items.append({"nombre": nombre, "cantidad": cant})
            else:
                match_pal = re.search(r'^(una?|dos|tres|cuatro|cinco)\s+(.+)$', parte_limpia, re.IGNORECASE)
                if match_pal:
                    cant = palabras_cant.get(match_pal.group(1).lower(), 1)
                    nombre = match_pal.group(2).strip()
                    lista_items.append({"nombre": nombre, "cantidad": cant})
                else:
                    lista_items.append({"nombre": parte_limpia, "cantidad": 1})

    if len(lista_items) > MAX_ITEMS_EN_PEDIDO:
        lista_items = lista_items[:MAX_ITEMS_EN_PEDIDO]

    for item in lista_items:
        item_mods = list(item.get("modifications") or item.get("modificaciones") or [])
        es_mitad, s1_str, s2_str, size_hint, cant_mitad = _detectar_mitad_y_mitad(item)
        if es_mitad:
            cantidad = cant_mitad
            if cantidad < 1:
                hay_cantidades_invalidas = True
                resumen_lineas.append(f"- Pizza mitad {s1_str} y mitad {s2_str}: la cantidad debe ser de al menos 1 unidad.")
                continue
            if cantidad > MAX_QUANTITY_PER_ITEM:
                hay_cantidades_invalidas = True
                resumen_lineas.append(
                    f"- Pizza mitad {s1_str} y mitad {s2_str}: supera la cantidad máxima permitida ({MAX_QUANTITY_PER_ITEM} unidades)."
                )
                continue

            s1_base, s1_mods = extraer_modificadores_de_texto(s1_str, db=db)
            s2_base, s2_mods = extraer_modificadores_de_texto(s2_str, db=db)
            all_mitad_mods = vincular_modificadores_con_db(db, item_mods + s1_mods + s2_mods)

            p1 = _buscar_sabor_pizza(db, s1_base, size_hint)
            p2 = _buscar_sabor_pizza(db, s2_base, size_hint)

            if not p1 or not p2:
                if not p1:
                    resumen_lineas.append(f"- No pudimos encontrar el sabor: '{s1_str}'")
                if not p2:
                    resumen_lineas.append(f"- No pudimos encontrar el sabor: '{s2_str}'")
                continue

            if isinstance(p1, list) or isinstance(p2, list):
                hay_ambiguos = True
                if isinstance(p1, list):
                    opciones = ", ".join(p.name for p in p1)
                    resumen_lineas.append(f"- '{s1_str}' puede ser: {opciones}. ¿Cuál querés?")
                if isinstance(p2, list):
                    opciones = ", ".join(p.name for p in p2)
                    resumen_lineas.append(f"- '{s2_str}' puede ser: {opciones}. ¿Cuál querés?")
                continue

            # Regla de cobro: la pizza mitad y mitad toma el valor del gusto más caro
            base_unitario = max(p1.price, p2.price)
            extra_cost = sum(
                to_money(m.get("price", 0))
                for m in all_mitad_mods
                if (m.get("type") in ("positive", "extra", "add") or m.get("action") == "add") and m.get("price")
            )
            precio_unitario = base_unitario + extra_cost
            subtotal = precio_unitario * cantidad
            total_general += subtotal

            nombre_unificado = format_half_and_half_name(p1.name, p2.name, size_hint)
            tags_texto = " ".join(m["tag"] for m in all_mitad_mods if m.get("tag"))
            nombre_mostrado = f"{nombre_unificado} {tags_texto}".strip() if tags_texto else nombre_unificado
            resumen_lineas.append(f"- {nombre_mostrado} (x{cantidad}) ${subtotal:,.2f}")
            items_validados.append({
                "product_id": p1.id,
                "secondary_product_id": p2.id,
                "nombre": nombre_unificado,
                "quantity": cantidad,
                "unit_price": float(precio_unitario),
                "modifications": all_mitad_mods,
            })
            continue

        raw_nombre = str(item.get("nombre", "")).strip()
        raw_cant = item.get("cantidad") if item.get("cantidad") is not None else item.get("quantity")
        try:
            cantidad = int(raw_cant) if raw_cant is not None else 1
        except (ValueError, TypeError):
            cantidad = 1

        if not raw_nombre:
            continue

        base_nombre, parsed_mods = extraer_modificadores_de_texto(raw_nombre, db=db)
        all_item_mods = vincular_modificadores_con_db(db, item_mods + parsed_mods)

        if cantidad < 1:
            hay_cantidades_invalidas = True
            resumen_lineas.append(f"- '{raw_nombre}': la cantidad debe ser de al menos 1 unidad.")
            continue

        if cantidad > MAX_QUANTITY_PER_ITEM:
            hay_cantidades_invalidas = True
            resumen_lineas.append(
                f"- '{raw_nombre}': supera la cantidad máxima permitida ({MAX_QUANTITY_PER_ITEM} unidades)."
            )
            continue

        producto = _buscar_producto(db, base_nombre)
        if not producto and raw_nombre != base_nombre:
            prod_directo = _buscar_producto(db, raw_nombre)
            if prod_directo:
                producto = prod_directo
                all_item_mods = []

        if not producto:
            resumen_lineas.append(f"- No pudimos encontrar el producto: '{raw_nombre}'")
            continue
        if isinstance(producto, list):
            hay_ambiguos = True
            opciones = ", ".join(p.name for p in producto)
            resumen_lineas.append(f"- '{base_nombre}' puede ser: {opciones}. ¿Cuál querés?")
            continue

        extra_cost = sum(
            to_money(m.get("price", 0))
            for m in all_item_mods
            if (m.get("type") in ("positive", "extra", "add") or m.get("action") == "add") and m.get("price")
        )
        precio_unitario = producto.price + extra_cost
        subtotal = precio_unitario * cantidad
        total_general += subtotal

        tags_texto = " ".join(m["tag"] for m in all_item_mods if m.get("tag"))
        nombre_mostrado = f"{producto.name} {tags_texto}".strip() if tags_texto else producto.name
        resumen_lineas.append(f"- {nombre_mostrado} (x{cantidad}) ${subtotal:,.2f}")
        items_validados.append({
            "product_id": producto.id,
            "nombre": producto.name,
            "quantity": cantidad,
            "unit_price": float(precio_unitario),
            "modifications": all_item_mods,
        })

    return ItemsResueltos(
        validados=items_validados,
        resumen=resumen_lineas,
        total=total_general,
        hay_ambiguos=hay_ambiguos,
        hay_cantidades_invalidas=hay_cantidades_invalidas,
    )


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
        # Sanitización de límites de longitud para campos de texto
        customer_name = (customer_name or "").strip()[:MAX_LARGO_CLIENTE] or None
        shipping_address = (shipping_address or "").strip()[:MAX_LARGO_DIRECCION] or None

        resueltos = _resolver_items(db, items_solicitados)
        if not resueltos.validados:
            return resueltos.mensaje_sin_items()
        resumen_lineas = resueltos.resumen
        total_general = resueltos.total
        items_validados = resueltos.validados
        hay_ambiguos = resueltos.hay_ambiguos
        hay_cantidades_invalidas = resueltos.hay_cantidades_invalidas

        es_retiro = metodo_entrega == DeliveryMethod.PICKUP
        falta_direccion = not es_retiro and not shipping_address
        telefono = (customer_phone or "").strip()
        falta_telefono = not _telefono_valido(telefono)
        notas = _limpiar_observaciones(observaciones)
        pago_normalizado = _normalizar_metodo_pago(metodo_pago)
        faltan_datos = (
            metodo_entrega is None or not customer_name or falta_telefono or falta_direccion or hay_ambiguos or hay_cantidades_invalidas
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
            if hay_cantidades_invalidas:
                faltantes.append("corregir las cantidades no válidas que te indiqué arriba")
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
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
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

        cliente = (datos.get("cliente") or datos.get("customer_name") or "Cliente").strip()[:MAX_LARGO_CLIENTE]
        raw_dir = datos.get("direccion") or datos.get("shipping_address")
        direccion = raw_dir.strip()[:MAX_LARGO_DIRECCION] if raw_dir else None
        telefono = str(datos.get("telefono") or datos.get("customer_phone") or "").strip()[:30]
        if canal == Channel.WHATSAPP and chat_id:
            # En WhatsApp el cliente se identifica por el número del chat: es el teléfono del pedido y de su perfil.
            telefono = normalize_phone(chat_id)

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
                channel=canal,
                chat_id=chat_id if canal else None,
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
