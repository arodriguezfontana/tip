from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.client import Client
from app.modules.user import User
from app.schemas.client_schemas import ClientPaginatedResponse, ClientResponse
from app.services.client_service import find_client_by_phone, get_clients_paginated, update_client

router = APIRouter()


class ClientUpdatePayload(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=150)
    phone: str = Field(..., min_length=1, max_length=30)
    address: str | None = Field(None, max_length=255)


@router.get("/lookup", response_model=ClientResponse)
def lookup_client(
    phone: str = Query(..., min_length=1, max_length=30, description="Teléfono del cliente, en cualquier formato."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> Client:
    """Busca un cliente de la agenda del local por teléfono para autocompletar la carga de pedidos."""
    client = find_client_by_phone(db, phone)
    if client is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Cliente no registrado")
    return client


@router.get("", response_model=ClientPaginatedResponse)
def list_clients(
    search: str | None = Query(None, description="Filtra por nombre o número de teléfono."),
    page: int = Query(1, ge=1, description="Número de página."),
    per_page: int = Query(20, ge=1, le=100, description="Cantidad de registros por página."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> ClientPaginatedResponse:
    """Lista los clientes registrados con búsqueda en tiempo real y paginación."""
    clients, total = get_clients_paginated(db, search=search, page=page, per_page=per_page)
    
    total_pages = (total + per_page - 1) // per_page if total > 0 else 1

    return ClientPaginatedResponse(
        items=[ClientResponse.model_validate(c) for c in clients],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.put("/{client_id}", response_model=ClientResponse)
def update_client_endpoint(
    client_id: int,
    payload: ClientUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> Client:
    """Actualiza la información de un cliente de la agenda."""
    try:
        updated = update_client(db, client_id, payload.full_name, payload.phone, payload.address)
        if not updated:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(e))