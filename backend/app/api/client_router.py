from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.client import Client
from app.modules.user import User
from app.schemas.client_schemas import ClientResponse
from app.services.client_service import find_client_by_phone

router = APIRouter()


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
