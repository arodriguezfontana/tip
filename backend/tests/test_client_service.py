import pytest

from app.modules.client import Client
from app.services.client_service import find_client_by_phone, normalize_phone, upsert_client


@pytest.mark.parametrize(
    "telefono,esperado",
    [
        ("11 4444-5555", "1144445555"),
        ("(011) 4444-5555", "01144445555"),
        ("+54 9 11 4444-5555", "+5491144445555"),
        ("  1144445555  ", "1144445555"),
        ("", ""),
    ],
)
def test_normaliza_telefonos(telefono, esperado):
    assert normalize_phone(telefono) == esperado


def test_busqueda_encuentra_al_cliente_con_cualquier_formato(db_session):
    db_session.add(Client(phone="1144445555", full_name="Paula"))
    db_session.commit()

    assert find_client_by_phone(db_session, "(11) 4444-5555").full_name == "Paula"


def test_busqueda_con_telefono_sin_digitos_no_devuelve_nada(db_session):
    db_session.add(Client(phone="", full_name="Fantasma"))
    db_session.commit()

    assert find_client_by_phone(db_session, "---") is None


def test_alta_de_cliente_nuevo_sin_direccion(db_session):
    client = upsert_client(db_session, "11 4444-5555", "Paula", None)
    db_session.commit()

    assert (client.phone, client.full_name, client.address) == ("1144445555", "Paula", None)


def test_actualiza_el_nombre_y_conserva_la_direccion_si_no_viene(db_session):
    upsert_client(db_session, "1144445555", "Paula", "Belgrano 95")
    db_session.commit()

    upsert_client(db_session, "11 4444 5555", "Paula Gómez", None)
    db_session.commit()

    [client] = db_session.query(Client).all()
    assert (client.full_name, client.address) == ("Paula Gómez", "Belgrano 95")


def test_lookup_valida_el_parametro(client):
    assert client.get("/api/v1/clients/lookup").status_code == 422
    assert client.get("/api/v1/clients/lookup", params={"phone": "1" * 31}).status_code == 422
