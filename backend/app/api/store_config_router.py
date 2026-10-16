from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.store_config_schemas import StoreConfigResponse, StoreConfigUpdate
from app.services.store_config_service import get_or_create_store_config, update_store_config

router = APIRouter()


@router.get("", response_model=StoreConfigResponse)
def get_store_config_endpoint(db: Session = Depends(get_db)) -> StoreConfigResponse:
    """Configuración pública del local (identidad visual y datos de contacto)."""
    return StoreConfigResponse.model_validate(get_or_create_store_config(db))


@router.put("", response_model=StoreConfigResponse)
def update_store_config_endpoint(
    payload: StoreConfigUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> StoreConfigResponse:
    """Actualiza la identidad y diseño del local (exclusivo para administradores)."""
    return StoreConfigResponse.model_validate(update_store_config(db, payload))

