"""Unidad de trabajo: los cambios de un caso de uso se confirman todos juntos o no se confirma ninguno."""

import pytest

from app.core.errors import ConflictError
from app.db.session import transaction
from app.modules.menu import Category
from app.services.catalog_service import create_category


def test_confirma_los_cambios_al_terminar_el_bloque(db_session):
    with transaction(db_session):
        db_session.add(Category(name="Empanadas"))

    db_session.rollback()  # no hay nada pendiente: ya quedó confirmado
    assert [c.name for c in db_session.query(Category)] == ["Empanadas"]


def test_si_algo_falla_deshace_todo_y_la_sesion_sigue_usable(db_session):
    with pytest.raises(RuntimeError):
        with transaction(db_session):
            db_session.add(Category(name="Empanadas"))
            db_session.flush()
            raise RuntimeError("falla a mitad del caso de uso")

    assert db_session.query(Category).count() == 0
    with transaction(db_session):
        db_session.add(Category(name="Postres"))
    assert db_session.query(Category).count() == 1


def test_un_error_de_negocio_a_mitad_de_camino_no_deja_cambios_a_medias(db_session, products):
    """La categoría se agrega antes de validar los productos: si alguno no existe, no queda creada."""
    with pytest.raises(ConflictError):
        create_category(db_session, "Bebidas", [products["coca"].id, 999])

    assert [c.name for c in db_session.query(Category)] == ["Pizzas"]
    db_session.refresh(products["coca"])
    assert products["coca"].category.name == "Pizzas"
