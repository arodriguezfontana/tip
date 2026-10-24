from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.services.human_handoff import AutorMensaje, Derivacion, MensajeDerivacion


class HandoffMessageResponse(BaseModel):
    author: Literal["customer", "bot", "employee", "system"]
    text: str
    sent_at: datetime

    @classmethod
    def of(cls, mensaje: MensajeDerivacion) -> "HandoffMessageResponse":
        return cls(author=mensaje.autor.value, text=mensaje.texto, sent_at=mensaje.enviado_en)


def _ultimo_mensaje(derivacion: Derivacion) -> "HandoffMessageResponse | None":
    """Último mensaje del cliente o del empleado (sin avisos del sistema ni respuestas del bot), para la lista."""
    for mensaje in reversed(derivacion.mensajes):
        if mensaje.autor in (AutorMensaje.CLIENTE, AutorMensaje.EMPLEADO):
            return HandoffMessageResponse.of(mensaje)
    return None


class HandoffSummaryResponse(BaseModel):
    id: int
    customer_name: str | None
    customer_username: str | None = None
    customer_phone: str | None = None
    reason: str | None
    status: Literal["waiting", "in_progress"]
    handled_by: str | None
    requested_at: datetime
    unread_count: int = 0
    last_message: HandoffMessageResponse | None = None

    @classmethod
    def of(cls, derivacion: Derivacion) -> "HandoffSummaryResponse":
        return cls(
            id=derivacion.id,
            customer_name=derivacion.cliente,
            customer_username=derivacion.usuario,
            customer_phone=derivacion.telefono,
            reason=derivacion.motivo,
            status=derivacion.estado.value,
            handled_by=derivacion.atendida_por,
            requested_at=derivacion.solicitada_en,
            unread_count=derivacion.sin_leer,
            last_message=_ultimo_mensaje(derivacion),
        )


class HandoffDetailResponse(HandoffSummaryResponse):
    messages: list[HandoffMessageResponse]

    @classmethod
    def of(cls, derivacion: Derivacion) -> "HandoffDetailResponse":
        return cls(
            **HandoffSummaryResponse.of(derivacion).model_dump(),
            messages=[HandoffMessageResponse.of(m) for m in derivacion.mensajes],
        )


class HandoffMessageCreate(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
