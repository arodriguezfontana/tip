from datetime import time

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.user import User
from app.schemas.business_hours_schemas import BusinessHoursRange, BusinessHoursStatus, BusinessHoursUpdate
from app.services.business_hours_service import (
    EstadoLocal,
    Franja,
    HorarioInvalidoError,
    estado_del_local,
    guardar_franjas,
)

router = APIRouter()


def _to_status(estado: EstadoLocal) -> BusinessHoursStatus:
    return BusinessHoursStatus(
        configured=estado.configurado,
        is_open=estado.abierto,
        closes_at=estado.cierra_a,
        next_opening=estado.proxima_apertura,
        next_opening_label=estado.descripcion_proxima_apertura,
        ranges=[
            BusinessHoursRange(
                day_of_week=franja.dia,
                opens_at=f"{franja.apertura:%H:%M}",
                closes_at=f"{franja.cierre:%H:%M}",
            )
            for franja in estado.franjas
        ],
    )


@router.get("", response_model=BusinessHoursStatus)
def get_business_hours(db: Session = Depends(get_db)) -> BusinessHoursStatus:
    """Endpoint público: horarios de atención y si el local está abierto para recibir pedidos."""
    return _to_status(estado_del_local(db))


@router.put("", response_model=BusinessHoursStatus)
def update_business_hours(
    payload: BusinessHoursUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> BusinessHoursStatus:
    """Reemplaza los horarios de atención del local (los días sin franjas quedan cerrados)."""
    franjas = [
        Franja(dia=r.day_of_week, apertura=time.fromisoformat(r.opens_at), cierre=time.fromisoformat(r.closes_at))
        for r in payload.ranges
    ]
    try:
        guardar_franjas(db, franjas)
    except HorarioInvalidoError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _to_status(estado_del_local(db))
