"""Herramientas del bot para cambiar un pedido que el cliente acaba de registrar.

Ubican el pedido por el chat del cliente (su último pedido) y devuelven el mensaje final para mandarle tal
cual: los montos, la ventana de modificación y el cobro de la diferencia los decide el sistema, no el modelo.
"""

import logging
from decimal import Decimal
from typing import Annotated

from langchain_core.tools import InjectedToolArg, tool
from sqlalchemy.orm import Session

from app.core.channels import Channel
from app.db.session import SessionLocal
from app.models.order import (
    DeliveryMethod,
    InvalidOrderError,
    ModificationWindowClosedError,
    Order,
    OrderNotModifiableError,
    OrderStatus,
    PaymentChangeNotAllowedError,
    PaymentMethod,
)
from app.services import order_service
from app.services.mercadopago_service import create_payment_preference
from app.services.store_config_service import get_or_create_store_config
from app.services.tools.order_tools import items_del_modelo, normalizar_metodo_pago, resolver_items

logger = logging.getLogger(__name__)

# Estados en los que el pedido ya terminó: no hay nada para modificar.
_ESTADOS_TERMINADOS = (OrderStatus.COMPLETED, OrderStatus.REJECTED, OrderStatus.CANCELLED)

MENSAJE_SIN_CANAL = "Por este medio no puedo modificar pedidos. Podés comunicarte con el local directamente."
MENSAJE_SIN_PEDIDO = (
    "No encuentro un pedido tuyo para modificar. Si querés hacer uno nuevo, contame qué te gustaría pedir."
)


AVISO_LINK_AL_ACEPTAR = "Te pasamos el link de pago cuando el local acepte tu pedido."


def _mensaje_en_camino(order: Order) -> str:
    return (
        f"Tu pedido #{order.shift_number} ya está en camino 🛵, así que no es posible modificarlo. "
        "Si querés, te tomo un pedido nuevo: contame qué te gustaría pedir."
    )


def _plata(monto: Decimal) -> str:
    return f"${monto:,.2f}"


def _mensaje_ventana_cerrada(db: Session) -> str:
    telefono = (get_or_create_store_config(db).contact_phone or "").strip()
    destino = f" al {telefono}" if telefono else ""
    return f"Tu pedido ya está en preparación. Para agregar algo más, por favor llamá directo al local{destino}."


def _pedido_del_cliente(db: Session, canal: Channel | None, chat_id: str | None) -> Order | None:
    if canal is None or not chat_id:
        return None
    return order_service.find_latest_chat_order(db, canal, chat_id)


def _link_de_pago(db: Session, order: Order, diferencia: bool) -> str:
    """Link de MercadoPago por el total (o solo por la diferencia) y queda registrado en el pedido."""
    preferencia = create_payment_preference(order, store_name=get_or_create_store_config(db).store_name, balance=diferencia)
    order.mp_preference_id = preferencia.get("preference_id")
    db.commit()
    return preferencia["init_point"]


def _detalle_agregado(resueltos) -> str:
    return "\n".join(resueltos.resumen)


def _pedido_activo_del_cliente(db: Session, canal: Channel | None, chat_id: str | None) -> Order | None:
    """El pedido del cliente si todavía está en curso; None si no tiene o ya terminó."""
    order = _pedido_del_cliente(db, canal, chat_id)
    if order is None or OrderStatus(order.status) in _ESTADOS_TERMINADOS:
        return None
    return order


def _rechazo_para_modificar(db: Session, order: Order) -> str | None:
    """Por qué el pedido en curso ya no admite que se le sumen productos, o None si todavía se puede."""
    if order.status == OrderStatus.ON_THE_WAY.value:
        return _mensaje_en_camino(order)
    if not order.is_modifiable or not order.is_within_modification_window():
        return _mensaje_ventana_cerrada(db)
    return None


def _aclaracion_previa_a_agregar(resueltos) -> str | None:
    """Qué hay que aclarar con el cliente antes de agregar lo pedido, o None si se puede agregar."""
    if not resueltos.validados:
        return resueltos.mensaje_sin_items()
    if resueltos.hay_ambiguos or resueltos.hay_cantidades_invalidas:
        return "Necesito que me aclares algunos productos antes de agregarlos:\n" + "\n".join(resueltos.resumen)
    return None


def _cuando_se_abona(order: Order) -> str:
    return "al retirarlo" if order.delivery_method == DeliveryMethod.PICKUP.value else "al recibirlo"


def _como_se_paga_tras_agregar(db: Session, order: Order) -> str:
    """Lo que sigue a los productos agregados: cuánto queda por pagar y cómo."""
    if order.has_partial_payment:
        return (
            f"Como ya habías pagado tu pedido anterior, te queda una diferencia de {_plata(order.amount_pending)}. "
            "¿Querés pagarla en efectivo cuando llegue el pedido o te mando un link de MercadoPago por la diferencia?"
        )
    nuevo_total = f"Nuevo total: {_plata(order.total_amount)}."
    if order.payment_method != PaymentMethod.MERCADOPAGO.value:
        return f"{nuevo_total} Lo abonás en efectivo {_cuando_se_abona(order)}."
    if order.status == OrderStatus.PENDING.value:
        return f"{nuevo_total} {AVISO_LINK_AL_ACEPTAR}"
    # El link anterior era por el total viejo: se genera uno nuevo por el total actualizado.
    link = _link_de_pago(db, order, diferencia=False)
    return (
        f"{nuevo_total}\n\n"
        f"💳 Como elegiste MercadoPago, pagá con este link por el total actualizado (el anterior ya no sirve):\n{link}"
    )


@tool
def agregar_items_al_pedido(
    items_solicitados: str,
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Agrega productos al pedido que el cliente YA registró (no crea un pedido nuevo). Usala cuando, después de
    haber confirmado su pedido, el cliente pide sumar algo más (ej: "agregame una Coca"). Solo se puede dentro de
    los 10 minutos posteriores a haber registrado el pedido: la herramienta lo controla y responde por vos.

    Args:
        items_solicitados: Solo los productos y cantidades que se AGREGAN (ej: "1 Coca-Cola, 2 Empanadas"), no los
            que ya tenía el pedido.
    """
    if canal is None:
        return MENSAJE_SIN_CANAL
    db = SessionLocal()
    try:
        order = _pedido_activo_del_cliente(db, canal, chat_id)
        if order is None:
            return MENSAJE_SIN_PEDIDO
        rechazo = _rechazo_para_modificar(db, order)
        if rechazo:
            return rechazo

        resueltos = resolver_items(db, items_solicitados)
        aclaracion = _aclaracion_previa_a_agregar(resueltos)
        if aclaracion:
            return aclaracion

        try:
            order_service.add_items_to_order(db, order, items_del_modelo(resueltos.validados) or [])
        except (ModificationWindowClosedError, OrderNotModifiableError):
            return _mensaje_ventana_cerrada(db)
        except InvalidOrderError as exc:
            return f"No pude agregar esos productos. {exc}"

        encabezado = f"¡Agregado! 🛒 Sumé a tu pedido #{order.shift_number}:\n{_detalle_agregado(resueltos)}\n\n"
        return encabezado + _como_se_paga_tras_agregar(db, order)
    except Exception:
        logger.exception("Error al agregar productos al pedido del chat %s", chat_id)
        return "No pude agregar los productos en este momento. Por favor, intentá nuevamente."
    finally:
        db.close()


def _cambiar_pago(db: Session, order: Order, metodo: str) -> str | None:
    """Cambia el medio de pago; devuelve el motivo por el que no se pudo, o None si se cambió."""
    try:
        order_service.change_order_payment_method(db, order, metodo)
    except OrderNotModifiableError:
        if order.status == OrderStatus.ON_THE_WAY.value:
            return _mensaje_en_camino(order)
        return "Tu pedido ya salió, así que no puedo cambiar el medio de pago. Cualquier duda, comunicate con el local."
    except PaymentChangeNotAllowedError:
        return f"Tu pedido #{order.shift_number} ya está abonado, no hay nada más por pagar. ✅"
    return None


def _confirmacion_de_pago_cambiado(db: Session, order: Order, metodo: str) -> str:
    parcial = order.has_partial_payment
    monto = order.amount_pending if parcial else Decimal(order.total_amount)
    que_se_paga = "la diferencia" if parcial else "el pedido"
    if metodo != PaymentMethod.MERCADOPAGO.value:
        return f"Listo ✅ Abonás {que_se_paga} ({_plata(monto)}) en efectivo {_cuando_se_abona(order)}."
    if order.status == OrderStatus.PENDING.value:
        return f"Listo ✅ Pagás {que_se_paga} ({_plata(monto)}) por MercadoPago. {AVISO_LINK_AL_ACEPTAR}"
    link = _link_de_pago(db, order, diferencia=parcial)
    return (
        f"Listo ✅ Te paso el link de MercadoPago por {que_se_paga} ({_plata(monto)}):\n{link}\n"
        "(Ingresá al link para abonar de forma digital)"
    )


@tool
def cambiar_metodo_de_pago(
    metodo_pago: str,
    canal: Annotated[Channel | None, InjectedToolArg] = None,
    chat_id: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Cambia cómo paga el cliente un pedido que YA registró (ej: "al final te pago en efectivo"), mientras el
    pedido no haya salido. También sirve para elegir cómo pagar la diferencia cuando se agregaron productos a un
    pedido ya abonado: efectivo al recibir o un link de MercadoPago por la diferencia. La herramienta responde por vos.

    Args:
        metodo_pago: "efectivo" o "mercadopago".
    """
    if canal is None:
        return MENSAJE_SIN_CANAL
    metodo = normalizar_metodo_pago(metodo_pago)
    if metodo is None:
        return 'No entendí cómo querés pagar. ¿Preferís "Efectivo" o "MercadoPago"?'

    db = SessionLocal()
    try:
        order = _pedido_activo_del_cliente(db, canal, chat_id)
        if order is None:
            return MENSAJE_SIN_PEDIDO
        rechazo = _cambiar_pago(db, order, metodo)
        return rechazo or _confirmacion_de_pago_cambiado(db, order, metodo)
    except Exception:
        logger.exception("Error al cambiar el medio de pago del pedido del chat %s", chat_id)
        return "No pude cambiar el medio de pago en este momento. Por favor, intentá nuevamente."
    finally:
        db.close()
