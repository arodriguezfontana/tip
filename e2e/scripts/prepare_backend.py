"""Deja la base de los tests e2e vacía, migrada y con los datos del seed.

Se ejecuta con el Python del backend y con PYTHONPATH apuntando a la carpeta backend/.
Por seguridad solo trabaja sobre bases cuyo nombre contenga "e2e": borra todo su contenido.
"""

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "")
    nombre = make_url(database_url).database or ""
    if "e2e" not in nombre:
        sys.exit(f"Por seguridad, los tests e2e solo usan bases con 'e2e' en el nombre (DATABASE_URL apunta a '{nombre}').")

    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    engine.dispose()

    # Alembic y el seed leen la configuración del backend (DATABASE_URL, ADMIN_EMAIL, etc.).
    os.chdir(BACKEND_DIR)
    from alembic.config import main as alembic

    alembic(argv=["upgrade", "head"])

    from app.db import seed

    seed.run()


if __name__ == "__main__":
    main()
