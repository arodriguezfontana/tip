"""Modelos del dominio (entidades ORM con sus reglas de negocio).

Para que SQLAlchemy y Alembic conozcan todas las tablas se importan juntos en app/db/base.py.
"""

from app.models.store_config import StoreConfig

__all__ = ["StoreConfig"]
