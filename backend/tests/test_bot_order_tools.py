"""Herramientas que usa el bot para calcular y registrar pedidos (sin pasar por Gemini)."""

import json
from unittest.mock import patch

import pytest

from app.modules.order import Order
from app.services.tools.order_tools import (
    _parsear_hora,
    calcular_y_preparar_pedido,
    confirmar_y_guardar_pedido,
)
from tests.conftest import TestingSessionLocal


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal):
        yield


def _calcular(**args) -> dict:
    return json.loads(calcular_y_preparar_pedido.invoke(args))


def _confirmar(datos: dict, chat_id: str | None = None) -> str:
    args = {"datos_pedido_json": json.dumps(datos)}
    if chat_id is not None:
        args["telegram_chat_id"] = chat_id
    return confirmar_y_guardar_pedido.invoke(args)


def _datos(products, **extra) -> dict:
    return {
        "items": [{"product_id": products["muzza"].id, "nombre": "Pizza Muzzarella", "quantity": 2, "unit_price": 8500.0}],
        "total": 17000.0,
        "cliente": "Paula",
        "telefono": "11 4444-5555",
        "direccion": "Belgrano 95",
        "metodo_entrega": "domicilio",
        **extra,
    }


# --- calcular_y_preparar_pedido ---


def test_calcula_el_total_con_los_precios_del_menu(products):
    respuesta = _calcular(items_solicitados="2 Pizza Muzzarella, 3 Coca-Cola 500ml")

    datos = respuesta["datos_temporales"]
    assert datos["total"] == 2 * 8500.0 + 3 * 2500.0
    assert [(i["nombre"], i["quantity"], i["unit_price"]) for i in datos["items"]] == [
        ("Pizza Muzzarella", 2, 8500.0),
        ("Coca-Cola 500ml", 3, 2500.0),
    ]


def test_acepta_los_items_como_json(products):
    items = json.dumps([{"nombre": "muzzarella", "cantidad": 2}, {"nombre": "coca", "quantity": 1}])

    datos = _calcular(items_solicitados=items)["datos_temporales"]

    assert datos["total"] == 2 * 8500.0 + 2500.0


@pytest.mark.parametrize("texto", ["2x Pizza Muzzarella", "2 - Pizza Muzzarella", "2 pizza muzzarella"])
def test_entiende_distintas_formas_de_escribir_la_cantidad(products, texto):
    datos = _calcular(items_solicitados=texto)["datos_temporales"]

    assert datos["items"][0]["quantity"] == 2


def test_informa_los_productos_que_no_encuentra(products):
    respuesta = _calcular(items_solicitados="1 Pizza Muzzarella, 1 Sushi")

    assert "No pudimos encontrar el producto: 'Sushi'" in respuesta["mensaje_para_usuario"]
    assert len(respuesta["datos_temporales"]["items"]) == 1


def test_no_ofrece_productos_agotados(products):
    resultado = calcular_y_preparar_pedido.invoke({"items_solicitados": "1 Pizza Agotada"})

    assert resultado == "No se pudieron reconocer productos válidos en el menú para tu pedido."


def test_marca_que_faltan_los_datos_de_entrega(products):
    respuesta = _calcular(items_solicitados="1 Pizza Muzzarella", metodo_entrega="domicilio")

    assert respuesta["datos_temporales"]["faltan_datos"] is True
    mensaje = respuesta["mensaje_para_usuario"]
    assert "tu nombre" in mensaje
    assert "un teléfono de contacto" in mensaje
    assert "tu dirección de envío" in mensaje


def test_retiro_no_pide_direccion(products):
    respuesta = _calcular(
        items_solicitados="1 Pizza Muzzarella",
        customer_name="Paula",
        customer_phone="11 4444-5555",
        metodo_entrega="retiro",
    )

    datos = respuesta["datos_temporales"]
    assert datos["faltan_datos"] is False
    assert datos["direccion"] == "Retiro en el local"
    assert "Retiro en el local" in respuesta["mensaje_para_usuario"]


def test_telefono_invalido_se_vuelve_a_pedir(products):
    respuesta = _calcular(
        items_solicitados="1 Pizza Muzzarella",
        customer_name="Paula",
        customer_phone="no tengo",
        metodo_entrega="retiro",
    )

    assert respuesta["datos_temporales"]["faltan_datos"] is True
    assert "un teléfono de contacto válido" in respuesta["mensaje_para_usuario"]


def test_horario_ininteligible_se_vuelve_a_preguntar(products):
    respuesta = _calcular(
        items_solicitados="1 Pizza Muzzarella",
        customer_name="Paula",
        customer_phone="11 4444-5555",
        metodo_entrega="retiro",
        hora_programada="a las 99",
    )

    assert respuesta["datos_temporales"]["faltan_datos"] is True
    assert "No entendí el horario" in respuesta["mensaje_para_usuario"]


@pytest.mark.parametrize("texto", ["25:00", "21:75"])
def test_rechaza_horas_imposibles(texto):
    assert _parsear_hora(texto) is None


def test_observaciones_largas_se_recortan(products):
    respuesta = _calcular(items_solicitados="1 Pizza Muzzarella", observaciones="x" * 600)

    assert len(respuesta["datos_temporales"]["observaciones"]) == 500


# --- confirmar_y_guardar_pedido ---


def test_registra_el_pedido_pendiente_con_el_chat_de_telegram(db_session, products):
    resultado = _confirmar(_datos(products), chat_id="98765")

    assert "Recibimos tu pedido" in resultado
    order = db_session.query(Order).one()
    assert order.status == "Pendiente"
    assert order.source == "bot"
    assert order.telegram_chat_id == "98765"
    assert order.delivery_method == "domicilio"
    assert order.shipping_address == "Belgrano 95"
    assert order.scheduled_for is None


def test_usa_los_precios_de_la_base_y_no_los_que_arma_el_modelo(db_session, products):
    datos = _datos(
        products,
        items=[{"product_id": products["muzza"].id, "quantity": 2, "unit_price": 1.0}],
        total=2.0,
    )

    _confirmar(datos)

    order = db_session.query(Order).one()
    assert order.total_amount == 2 * 8500.0
    assert [(i.quantity, i.unit_price) for i in order.items] == [(2, 8500.0)]


def test_agrupa_productos_repetidos(db_session, products):
    muzza_id = products["muzza"].id
    _confirmar(_datos(products, items=[{"product_id": muzza_id, "quantity": 1}, {"product_id": muzza_id, "quantity": 2}]))

    [item] = db_session.query(Order).one().items
    assert item.quantity == 3


@pytest.mark.parametrize(
    "items",
    [
        [],
        [{"product_id": 9999, "quantity": 1}],
        [{"nombre": "sin id", "quantity": 1}],
        [{"product_id": "abc", "quantity": 1}],
    ],
)
def test_no_registra_pedidos_con_productos_invalidos(db_session, products, items):
    resultado = _confirmar(_datos(products, items=items))

    assert "NO se registró" in resultado
    assert db_session.query(Order).count() == 0


def test_no_registra_productos_que_se_agotaron_durante_la_charla(db_session, products):
    resultado = _confirmar(_datos(products, items=[{"product_id": products["agotada"].id, "quantity": 1}]))

    assert "ya no están disponibles" in resultado
    assert db_session.query(Order).count() == 0


@pytest.mark.parametrize("metodo", ["retiro", "Retiro en el local", "lo paso a buscar por el local"])
def test_detecta_el_retiro_aunque_el_modelo_lo_escriba_distinto(db_session, products, metodo):
    _confirmar(_datos(products, metodo_entrega=metodo, direccion=None))

    order = db_session.query(Order).one()
    assert order.delivery_method == "retiro"
    assert order.shipping_address == "Retiro en el local"


def test_envio_sin_direccion_no_se_registra(db_session, products):
    resultado = _confirmar(_datos(products, direccion=None))

    assert "Faltan datos obligatorios" in resultado
    assert db_session.query(Order).count() == 0


def test_json_invalido_no_rompe_la_conversacion(db_session):
    resultado = confirmar_y_guardar_pedido.invoke({"datos_pedido_json": "esto no es json"})

    assert "Error al procesar el registro del pedido" in resultado
    assert db_session.query(Order).count() == 0
