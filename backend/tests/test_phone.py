"""Formato único de teléfonos: el mismo celular escrito de cualquier manera es siempre el mismo número."""

import pytest

from app.core.phone import normalize_phone
from app.models.client import Client
from app.models.order import Order
from app.services import client_service
from app.services.order_service import CounterPayment, OrderRequest, create_counter_order


@pytest.mark.parametrize(
    "escrito",
    [
        "1162939338",
        "11 6293-9338",
        "(11) 6293-9338",
        "011 6293-9338",
        "011 15 6293-9338",
        "11 15 6293 9338",
        "+54 9 11 6293-9338",
        "+5491162939338",
        "5491162939338",  # como lo entrega WhatsApp
        "541162939338",
        "9 11 6293-9338",
        "  +54 11 6293 9338  ",
    ],
)
def test_un_celular_argentino_siempre_queda_igual(escrito):
    assert normalize_phone(escrito) == "1162939338"


@pytest.mark.parametrize(
    "escrito,esperado",
    [
        ("0351 15 123 4567", "3511234567"),  # código de área de 3 dígitos
        ("+54 9 351 123-4567", "3511234567"),
        ("02271 15 12 3456", "2271123456"),  # código de área de 4 dígitos
        ("4444-5555", "44445555"),  # sin código de área: no se puede completar
    ],
)
def test_otros_codigos_de_area(escrito, esperado):
    assert normalize_phone(escrito) == esperado


@pytest.mark.parametrize(
    "escrito,esperado",
    [
        ("+598 99 123 456", "+598 99 123 456".replace(" ", "")),  # Uruguay: se respeta
        ("+55 11 98765-4321", "+5511987654321"),  # Brasil
        ("5511987654321", "5511987654321"),
        ("", ""),
        ("   ", ""),
        (None, ""),
    ],
)
def test_otros_paises_y_vacios_no_se_tocan(escrito, esperado):
    assert normalize_phone(escrito) == esperado


def test_la_normalizacion_es_idempotente():
    assert normalize_phone(normalize_phone("+54 9 11 6293-9338")) == "1162939338"


# --- Dónde se aplica ---


def test_el_telefono_de_whatsapp_encuentra_al_cliente_cargado_en_formato_local(db_session):
    db_session.add(Client(phone="11 6293-9338", full_name="Carlos", address="Condarco 1145"))
    db_session.commit()

    cliente = client_service.get_client_by_phone(db_session, "5491162939338")

    assert cliente is not None and cliente.full_name == "Carlos"


def test_el_mismo_numero_escrito_distinto_no_duplica_al_cliente(db_session):
    client_service.upsert_client(db_session, "+54 9 11 6293-9338", "Carlos", None)
    db_session.commit()
    client_service.upsert_client(db_session, "011 6293-9338", "Carlos Pérez", "Condarco 1145")
    db_session.commit()

    [cliente] = db_session.query(Client).all()
    assert (cliente.phone, cliente.full_name, cliente.address) == ("1162939338", "Carlos Pérez", "Condarco 1145")


def test_el_panel_busca_al_cliente_con_cualquier_formato(client, db_session):
    db_session.add(Client(phone="1162939338", full_name="Carlos", address=None))
    db_session.commit()

    respuesta = client.get("/api/v1/clients/lookup", params={"phone": "+54 9 11 6293-9338"})

    assert respuesta.status_code == 200
    assert respuesta.json()["full_name"] == "Carlos"


def test_el_telefono_del_pedido_queda_en_el_formato_unico(db_session, products, open_shift):
    pedido = OrderRequest(
        customer_name="Carlos",
        customer_phone="+54 9 11 6293-9338",
        delivery_method="retiro",
        shipping_address=None,
        notes=None,
        items=[(products["muzza"].id, 1)],
    )

    create_counter_order(db_session, pedido, CounterPayment(method="efectivo", is_paid=False))

    assert db_session.query(Order).one().customer_phone == "1162939338"
