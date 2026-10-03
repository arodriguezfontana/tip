"""Listado y edición de la agenda de clientes desde el panel."""

from datetime import datetime, timedelta, timezone

import pytest

from app.modules.client import Client

CLIENTS_URL = "/api/v1/clients"


@pytest.fixture()
def agenda(db_session):
    base = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
    clientes = [
        Client(phone="1144445555", full_name="Paula Gómez", address="Belgrano 95", created_at=base),
        Client(phone="1155556666", full_name="Martín Pérez", address=None, created_at=base + timedelta(hours=1)),
        Client(phone="1166667777", full_name="Paula Ruiz", address="Rivadavia 1200", created_at=base + timedelta(hours=2)),
    ]
    db_session.add_all(clientes)
    db_session.commit()
    return {c.full_name: c for c in clientes}


def test_lista_los_clientes_del_mas_nuevo_al_mas_viejo(client, agenda):
    response = client.get(CLIENTS_URL)

    assert response.status_code == 200
    body = response.json()
    assert [c["full_name"] for c in body["items"]] == ["Paula Ruiz", "Martín Pérez", "Paula Gómez"]
    assert (body["total"], body["page"], body["total_pages"]) == (3, 1, 1)
    assert body["items"][0]["created_at"]


@pytest.mark.parametrize(
    "search,esperados",
    [
        ("paula", {"Paula Gómez", "Paula Ruiz"}),
        ("Pérez", {"Martín Pérez"}),
        ("5556", {"Martín Pérez"}),
        ("  1144  ", {"Paula Gómez"}),
        ("nadie", set()),
    ],
)
def test_busca_por_nombre_o_telefono(client, agenda, search, esperados):
    response = client.get(CLIENTS_URL, params={"search": search})

    nombres = {c["full_name"] for c in response.json()["items"]}
    assert nombres == esperados
    assert response.json()["total"] == len(esperados)


def test_pagina_el_listado(client, agenda):
    primera = client.get(CLIENTS_URL, params={"per_page": 2}).json()
    segunda = client.get(CLIENTS_URL, params={"per_page": 2, "page": 2}).json()

    assert (primera["total"], primera["total_pages"]) == (3, 2)
    assert [c["full_name"] for c in primera["items"]] == ["Paula Ruiz", "Martín Pérez"]
    assert [c["full_name"] for c in segunda["items"]] == ["Paula Gómez"]


def test_agenda_vacia_tiene_una_sola_pagina(client, db_session):
    body = client.get(CLIENTS_URL).json()

    assert (body["items"], body["total"], body["total_pages"]) == ([], 0, 1)


@pytest.mark.parametrize("params", [{"page": 0}, {"per_page": 0}, {"per_page": 101}])
def test_valida_los_parametros_de_paginacion(client, params):
    assert client.get(CLIENTS_URL, params=params).status_code == 422


def test_edita_un_cliente_y_normaliza_el_telefono(client, db_session, agenda):
    martin = agenda["Martín Pérez"]

    response = client.put(
        f"{CLIENTS_URL}/{martin.id}",
        json={"full_name": "  Martín A. Pérez ", "phone": "(11) 5555-0000", "address": " Corrientes 1000 "},
    )

    assert response.status_code == 200
    db_session.refresh(martin)
    assert (martin.full_name, martin.phone, martin.address) == ("Martín A. Pérez", "1155550000", "Corrientes 1000")
    # El autocompletado del mostrador lo encuentra con el teléfono nuevo.
    assert client.get(f"{CLIENTS_URL}/lookup", params={"phone": "11 5555-0000"}).json()["id"] == martin.id


def test_dejar_la_direccion_vacia_la_borra(client, db_session, agenda):
    paula = agenda["Paula Gómez"]

    response = client.put(f"{CLIENTS_URL}/{paula.id}", json={"full_name": "Paula Gómez", "phone": "1144445555", "address": ""})

    assert response.status_code == 200
    assert response.json()["address"] is None


def test_no_permite_usar_el_telefono_de_otro_cliente(client, db_session, agenda):
    martin = agenda["Martín Pérez"]

    response = client.put(
        f"{CLIENTS_URL}/{martin.id}", json={"full_name": "Martín Pérez", "phone": "11 4444-5555", "address": None}
    )

    assert response.status_code == 400
    assert "ya está registrado" in response.json()["detail"]
    db_session.refresh(martin)
    assert martin.phone == "1155556666"


@pytest.mark.parametrize("phone", ["abc", "---", "12345", ""])
def test_rechaza_telefonos_invalidos(client, db_session, agenda, phone):
    """Un teléfono sin dígitos quedaba vacío al normalizarlo y se guardaba así."""
    martin = agenda["Martín Pérez"]

    response = client.put(f"{CLIENTS_URL}/{martin.id}", json={"full_name": "Martín", "phone": phone, "address": None})

    assert response.status_code == 422
    db_session.refresh(martin)
    assert martin.phone == "1155556666"


def test_editar_un_cliente_inexistente_devuelve_404(client, db_session):
    response = client.put(f"{CLIENTS_URL}/999", json={"full_name": "Nadie", "phone": "1100000000", "address": None})

    assert response.status_code == 404


@pytest.mark.parametrize("method,url", [("get", CLIENTS_URL), ("put", f"{CLIENTS_URL}/1")])
def test_la_agenda_es_solo_para_el_personal(public_client, customer_headers, method, url):
    kwargs = {"json": {"full_name": "X", "phone": "1100000000", "address": None}} if method == "put" else {}

    assert getattr(public_client, method)(url, **kwargs).status_code == 401
    assert getattr(public_client, method)(url, headers=customer_headers, **kwargs).status_code == 403
