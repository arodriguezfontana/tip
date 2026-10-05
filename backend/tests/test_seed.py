from unittest.mock import patch

import pytest

from app.core.config import settings
from app.core.security import verify_password
from app.db import seed
from app.modules.menu import Category, Product, ProductIngredient
from app.modules.user import User
from tests.conftest import TestingSessionLocal


@pytest.fixture()
def run_seed(db_session):
    def run():
        with patch.object(seed, "SessionLocal", TestingSessionLocal):
            seed.run()

    return run


def test_seed_carga_admin_categorias_y_menu(run_seed, db_session):
    run_seed()

    admin = db_session.query(User).one()
    assert admin.email == settings.ADMIN_EMAIL
    assert admin.role == "ADMIN"
    assert verify_password(settings.ADMIN_PASSWORD, admin.hashed_password)

    assert {c.name for c in db_session.query(Category)} == {"Pizzas", "Bebidas", "Postres"}
    productos = db_session.query(Product).all()
    assert len(productos) > 5
    assert all(p.price > 0 and p.is_active for p in productos)
    assert db_session.query(ProductIngredient).count() > 0


def test_seed_se_puede_correr_varias_veces_sin_duplicar(run_seed, db_session):
    run_seed()
    cantidades = (db_session.query(User).count(), db_session.query(Product).count(), db_session.query(ProductIngredient).count())

    run_seed()

    assert (db_session.query(User).count(), db_session.query(Product).count(), db_session.query(ProductIngredient).count()) == cantidades


def test_menu_cargado_por_el_seed_se_ve_en_la_web(run_seed, public_client):
    run_seed()

    response = public_client.get("/api/v1/menu/products")

    assert response.status_code == 200
    categorias = {p["category"]["name"] for p in response.json()}
    assert categorias == {"Pizzas", "Bebidas", "Postres"}
