from sqlalchemy.orm import Session

from app.modules.store_config import StoreConfig
from app.schemas.store_config_schemas import StoreConfigUpdate


def get_or_create_store_config(db: Session) -> StoreConfig:
    """Obtiene la configuración actual del local o crea la configuración predeterminada si no existe."""
    config = db.query(StoreConfig).first()
    if config is None:
        config = StoreConfig(
            store_name="RestoIT",
            address="Av. Corrientes 1234, CABA",
            opening_hours="Martes a Domingo: 19:30 a 00:00",
            contact_phone="11 4444-5555",
            theme_color="black",
            login_bg="bistro",
            logo_url=None,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def update_store_config(db: Session, data: StoreConfigUpdate) -> StoreConfig:
    """Actualiza la identidad visual y datos de contacto de la tienda."""
    config = get_or_create_store_config(db)
    config.store_name = data.store_name
    config.address = data.address
    config.opening_hours = data.opening_hours
    config.contact_phone = data.contact_phone
    config.logo_url = data.logo_url
    config.theme_color = data.theme_color
    if data.login_bg:
        config.login_bg = data.login_bg
    db.commit()
    db.refresh(config)
    return config

