import os

# Valores de prueba para que los tests no dependan del .env local (ni usen credenciales reales) y
# corran igual en CI. Se definen antes de importar la app porque la configuración se lee al importarla.
_TEST_ENV = {
    "DATABASE_URL": "sqlite://",
    "TELEGRAM_TOKEN": "test-telegram-token",
    "TELEGRAM_WEBHOOK_SECRET": "",
    "GOOGLE_API_KEY": "test-google-api-key",
    "JWT_SECRET_KEY": "test-jwt-secret-key-con-largo-suficiente",
    "ADMIN_EMAIL": "admin@restoit.com",
    "ADMIN_PASSWORD": "admin-password-de-test",
}
for _key, _value in _TEST_ENV.items():
    os.environ.setdefault(_key, _value)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.api.deps import get_current_user  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.menu import Category, Product  # noqa: E402
from app.modules.user import User  # noqa: E402

# Por defecto SQLite en memoria (rápido, sin dependencias). En CI se apunta TEST_DATABASE_URL a un
# PostgreSQL real para validar también las restricciones y el comportamiento del motor de producción.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

if TEST_DATABASE_URL:
    engine = create_engine(TEST_DATABASE_URL)
else:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """Cliente con un administrador ya autenticado (sin token): para probar el panel."""
    fake_user = User(id=1, email="empleado@test.com", role="ADMIN", is_active=True)

    def override_get_db():
        yield db_session

    def override_get_current_user():
        return fake_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def public_client(db_session):
    """Cliente sin usuario mockeado: los endpoints públicos responden y los privados exigen un token real."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def products(db_session):
    """Menú mínimo: dos productos disponibles y uno agotado."""
    category = Category(name="Pizzas")
    db_session.add(category)
    db_session.flush()
    muzza = Product(name="Pizza Muzzarella", price=8500.0, category_id=category.id, dietary_restrictions=[])
    coca = Product(name="Coca-Cola 500ml", price=2500.0, category_id=category.id, dietary_restrictions=[])
    agotada = Product(
        name="Pizza Agotada", price=9000.0, category_id=category.id, dietary_restrictions=[], is_active=False
    )
    db_session.add_all([muzza, coca, agotada])
    db_session.commit()
    return {"muzza": muzza, "coca": coca, "agotada": agotada}


@pytest.fixture()
def muzza(products):
    return products["muzza"]


def create_user(db_session, role: str = "ADMIN", email: str | None = None, password: str = "clave1234", **extra) -> User:
    user = User(
        email=email or f"{role.lower()}@local.com",
        hashed_password=hash_password(password),
        role=role,
        is_active=extra.pop("is_active", True),
        **extra,
    )
    db_session.add(user)
    db_session.commit()
    return user


def auth_headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(subject=str(user.id), role=user.role)}"}


@pytest.fixture()
def admin_headers(db_session) -> dict:
    return auth_headers(create_user(db_session, "ADMIN", email="admin@local.com"))


@pytest.fixture()
def customer_headers(db_session) -> dict:
    return auth_headers(create_user(db_session, "CUSTOMER", email="cliente@mail.com"))
