from logging.config import fileConfig

from alembic import context
from app.core.config import settings
from app.db.session import Base

config = context.config

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata