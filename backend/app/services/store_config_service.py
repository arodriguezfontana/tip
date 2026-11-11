from typing import Protocol

from sqlalchemy.orm import Session

from app.db.session import transaction
from app.models.store_config import StoreConfig
from app.repositories import store_config_repository


class StoreConfigChanges(Protocol):
    """Los datos de la configuración del local que se guardan."""

    store_name: str
    address: str | None
    contact_phone: str | None
    logo_url: str | None
    theme_color: str
    mp_alias: str | None
    login_bg: str
    login_bg_image: str | None
    panel_bg: str
    panel_bg_image: str | None
    panel_bg_color: str | None
    cash_pin_enabled: bool
    cash_pin: str | None


DEFAULT_STORE_CONFIG = {
    "store_name": "RestoIT",
    "address": "Av. Corrientes 1234, CABA",
    "contact_phone": "11 4444-5555",
    "theme_color": "black",
    "login_bg": "bistro",
    "panel_bg": "none",
    "logo_url": None,
    "mp_alias": None,
    "cash_pin_enabled": False,
    "cash_pin": None,
}


def get_or_create_store_config(db: Session) -> StoreConfig:
    """Obtiene la configuración actual del local o crea la predeterminada si aún no existe."""
    config = store_config_repository.get(db)
    if config is None:
        with transaction(db):
            config = StoreConfig(**DEFAULT_STORE_CONFIG)
            store_config_repository.add(db, config)
    return config


def update_store_config(db: Session, data: StoreConfigChanges) -> StoreConfig:
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
        config.panel_bg = data.panel_bg
        config.panel_bg_image = data.panel_bg_image
        config.panel_bg_color = data.panel_bg_color
        config.cash_pin_enabled = data.cash_pin_enabled
        config.cash_pin = data.cash_pin if data.cash_pin_enabled else None
    db.refresh(config)
    return config


def set_menu_link(db: Session, menu_link: str | None) -> StoreConfig:
    """Guarda el link externo a la carta del local."""
    with transaction(db):
        config = get_or_create_store_config(db)
        config.menu_link = menu_link
    db.refresh(config)
    return config


def set_promotions_link(db: Session, promotions_link: str | None) -> StoreConfig:
    """Guarda el link externo a las promociones del local."""
    with transaction(db):
        config = get_or_create_store_config(db)
        config.promotions_link = promotions_link
    db.refresh(config)
    return config
