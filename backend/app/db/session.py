from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def transaction(db: Session) -> Iterator[None]:
    """Unidad de trabajo de un caso de uso: confirma todos los cambios juntos al terminar el bloque o, si algo
    falla, los deshace todos (y deja la sesión usable). Los servicios marcan así dónde empieza y termina cada
    operación; los repositorios nunca confirman por su cuenta.
    """
    try:
        yield
        db.commit()
    except Exception:
        db.rollback()
        raise
