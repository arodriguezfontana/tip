from sqlalchemy.orm import Session

from app.models.store_config import StoreConfig


def get(db: Session) -> StoreConfig | None:
    """Configuración actual del local (primer registro)."""
    return db.query(StoreConfig).first()


def add(db: Session, config: StoreConfig) -> StoreConfig:
    """Registra la configuración inicial del local (sin confirmar la transacción)."""
    db.add(config)
    db.flush()
    return config

