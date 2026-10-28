from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin
from app.core.channels import split_session_key
from app.models.user import User
from app.schemas.handoff_schemas import HandoffDetailResponse, HandoffMessageCreate, HandoffSummaryResponse
from app.services.channels import enviar_mensaje
from app.services.human_handoff import MENSAJE_FIN_DERIVACION, derivaciones

router = APIRouter()


def _empleado(user: User) -> str:
    return user.full_name or user.email


@router.get("", response_model=list[HandoffSummaryResponse])
def list_handoffs(current_user: User = Depends(get_current_admin)) -> list[HandoffSummaryResponse]:
    """Conversaciones en las que el cliente pidió hablar con una persona (esperando o ya en atención)."""
    return [HandoffSummaryResponse.of(d) for d in derivaciones.listar()]


@router.get("/{handoff_id}", response_model=HandoffDetailResponse)
def get_handoff(handoff_id: int, current_user: User = Depends(get_current_admin)) -> HandoffDetailResponse:
    """Chat completo. Como solo lo consulta el chat abierto del empleado, también marca los mensajes como leídos."""
    derivaciones.marcar_leida(handoff_id)
    return HandoffDetailResponse.of(derivaciones.obtener(handoff_id))


@router.post("/{handoff_id}/take", response_model=HandoffDetailResponse)
def take_handoff(handoff_id: int, current_user: User = Depends(get_current_admin)) -> HandoffDetailResponse:
    """El empleado toma el control de la conversación."""
    return HandoffDetailResponse.of(derivaciones.tomar(handoff_id, _empleado(current_user)))


@router.post("/{handoff_id}/messages", response_model=HandoffDetailResponse)
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
