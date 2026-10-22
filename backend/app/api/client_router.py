from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.client import Client
from app.models.user import User
from app.schemas.client_schemas import ClientPaginatedResponse, ClientResponse, ClientUpdatePayload
from app.services import client_service

router = APIRouter()


@router.get("/lookup", response_model=ClientResponse)
def lookup_client(
    phone: str = Query(..., min_length=1, max_length=30, description="Teléfono del cliente, en cualquier formato."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> Client:
    """Busca un cliente de la agenda del local por teléfono para autocompletar la carga de pedidos."""
    return client_service.find_client_by_phone(db, phone)


@router.get("", response_model=ClientPaginatedResponse)
def list_clients(
    search: str | None = Query(None, description="Filtra por nombre o número de teléfono."),
    page: int = Query(1, ge=1, description="Número de página."),
    per_page: int = Query(20, ge=1, le=100, description="Cantidad de registros por página."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> ClientPaginatedResponse:
    """Lista los clientes de la agenda con búsqueda y paginación."""
    return ClientPaginatedResponse.from_page(client_service.list_clients(db, search=search, page=page, per_page=per_page))


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: int,
    payload: ClientUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> Client:
    """Actualiza la información de un cliente de la agenda."""
    return client_service.update_client(db, client_id, payload.full_name, payload.phone, payload.address)
