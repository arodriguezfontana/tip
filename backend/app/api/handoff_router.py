from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.core.channels import session_key, split_session_key
from app.core.errors import BusinessRuleError
from app.models.order import Order
from app.models.user import User
from app.schemas.handoff_schemas import HandoffDetailResponse, HandoffMessageCreate, HandoffSummaryResponse
from app.services import order_service
from app.services.bot_service import bot_service
from app.services.channels import enviar_mensaje
from app.services.human_handoff import (
    MENSAJE_FIN_DERIVACION,
    Derivacion,
    derivaciones,
)

router = APIRouter()


def _empleado(user: User) -> str:
    return user.full_name or user.email


@router.get("", dependencies=[Depends(get_current_admin)])
def list_handoffs() -> list[HandoffSummaryResponse]:
    """Conversaciones en las que el cliente pidió hablar con una persona (esperando o ya en atención)."""
    return [HandoffSummaryResponse.of(d) for d in derivaciones.listar()]


def _clave_del_chat(order: Order) -> str:
    if not order.channel or not order.chat_id:
        raise BusinessRuleError("Este pedido no salió de un chat: no hay una conversación con el cliente.")
    return session_key(order.channel, order.chat_id)


@router.get("/by-order/{order_id}", dependencies=[Depends(get_current_admin)])
def get_order_chat(
    order_id: int,
    db: Session = Depends(get_db),
) -> HandoffDetailResponse:
    """Chat con el cliente de un pedido del bot. No pausa al bot: eso pasa recién cuando el empleado escribe.

    Si el chat está intervenido devuelve esa conversación; si no, el historial que el bot tiene en memoria.
    """
    order = order_service.get_order(db, order_id)
    clave = _clave_del_chat(order)
    activa = derivaciones.del_chat(clave)
    if activa is not None:
        derivaciones.marcar_leida(activa.id)
        return HandoffDetailResponse.of(activa)
    perfil = bot_service.perfil(clave)
    transitoria = Derivacion(
        id=0,
        chat_id=clave,
        cliente=order.customer_name or perfil.get("nombre"),
        motivo=None,
        usuario=perfil.get("usuario"),
        telefono=order.customer_phone,
        mensajes=bot_service.transcripcion(clave),
        transitoria=True,
    )
    return HandoffDetailResponse.of(transitoria)


@router.post("/by-order/{order_id}/messages")
async def send_order_chat_message(
    order_id: int,
    payload: HandoffMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> HandoffDetailResponse:
    """El empleado le escribe al cliente de un pedido: el bot se pausa en ese chat hasta que se cierre la atención
    o pasen 10 minutos sin mensajes."""
    order = order_service.get_order(db, order_id)
    clave = _clave_del_chat(order)
    perfil = bot_service.perfil(clave)
    empleado = _empleado(current_user)
    activa = derivaciones.intervenir(
        clave,
        empleado,
        cliente=order.customer_name or perfil.get("nombre"),
        usuario=perfil.get("usuario"),
        telefono=order.customer_phone,
        historial=bot_service.transcripcion(clave),
    )
    texto = payload.text.strip()
    derivacion = derivaciones.registrar_respuesta(activa.id, empleado, texto)
    canal, chat_id = split_session_key(clave)
    await enviar_mensaje(canal, chat_id, texto)
    return HandoffDetailResponse.of(derivacion)


@router.get("/{handoff_id}", dependencies=[Depends(get_current_admin)])
def get_handoff(handoff_id: int) -> HandoffDetailResponse:
    """Chat completo. Como solo lo consulta el chat abierto del empleado, también marca los mensajes como leídos."""
    derivaciones.marcar_leida(handoff_id)
    return HandoffDetailResponse.of(derivaciones.obtener(handoff_id))


@router.post("/{handoff_id}/take")
def take_handoff(handoff_id: int, current_user: User = Depends(get_current_admin)) -> HandoffDetailResponse:
    """El empleado toma el control de la conversación."""
    return HandoffDetailResponse.of(derivaciones.tomar(handoff_id, _empleado(current_user)))


@router.post("/{handoff_id}/messages")
async def send_handoff_message(
    handoff_id: int,
    payload: HandoffMessageCreate,
    current_user: User = Depends(get_current_admin),
) -> HandoffDetailResponse:
    """El empleado le escribe al cliente por el mismo canal por el que habló con el bot."""
    texto = payload.text.strip()
    derivacion = derivaciones.registrar_respuesta(handoff_id, _empleado(current_user), texto)
    canal, chat_id = split_session_key(derivacion.chat_id)
    await enviar_mensaje(canal, chat_id, texto)
    return HandoffDetailResponse.of(derivacion)


@router.post("/{handoff_id}/finish", status_code=204)
async def finish_handoff(handoff_id: int, current_user: User = Depends(get_current_admin)) -> None:
    """Termina la atención: el chat vuelve al bot (notificaciones automáticas y próximos pedidos)."""
    derivacion = derivaciones.finalizar(handoff_id, _empleado(current_user))
    canal, chat_id = split_session_key(derivacion.chat_id)
    await enviar_mensaje(canal, chat_id, MENSAJE_FIN_DERIVACION)
