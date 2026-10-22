from sqlalchemy.orm import Session

from app.db.session import transaction
from app.models.store_config import StoreConfig
from app.repositories import store_config_repository
from app.schemas.store_config_schemas import StoreConfigUpdate

DEFAULT_STORE_CONFIG = {
    "store_name": "RestoIT",
    "address": "Av. Corrientes 1234, CABA",
    "contact_phone": "11 4444-5555",
    "theme_color": "black",
    "login_bg": "bistro",
    "logo_url": None,
    "mp_alias": None,
}


def get_or_create_store_config(db: Session) -> StoreConfig:
    """Obtiene la configuración actual del local o crea la predeterminada si aún no existe."""
    config = store_config_repository.get(db)
    if config is None:
        with transaction(db):
            config = StoreConfig(**DEFAULT_STORE_CONFIG)
            store_config_repository.add(db, config)
    return config


def update_store_config(db: Session, data: StoreConfigUpdate) -> StoreConfig:
    """Actualiza la identidad visual y datos de contacto de la tienda."""
    with transaction(db):
        config = get_or_create_store_config(db)
        config.store_name = data.store_name
        config.address = data.address
        config.contact_phone = data.contact_phone
        config.logo_url = data.logo_url
        config.theme_color = data.theme_color
        config.mp_alias = data.mp_alias
        if data.login_bg:
            config.login_bg = data.login_bg
        config.login_bg_image = data.login_bg_image
    db.refresh(config)
    return config

