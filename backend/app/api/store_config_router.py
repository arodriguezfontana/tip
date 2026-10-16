from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.modules.store_config import StoreConfig
from app.modules.user import User
from app.schemas.store_config_schemas import StoreConfigResponse, StoreConfigUpdate
from app.services.store_config_service import get_or_create_store_config, update_store_config

router = APIRouter()


@router.get("", response_model=StoreConfigResponse)
def get_store_config(db: Session = Depends(get_db)) -> StoreConfig:
    """Consulta pública de la configuración visual y de contacto de la tienda."""
    return get_or_create_store_config(db)


@router.put("", response_model=StoreConfigResponse)
def modify_store_config(
    payload: StoreConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> StoreConfig:
    """Actualiza la configuración visual y de contacto de la tienda (exclusivo para administradores)."""
    return update_store_config(db, payload)

