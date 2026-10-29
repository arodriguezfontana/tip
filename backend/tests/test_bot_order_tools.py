"""Herramientas que usa el bot para calcular y registrar pedidos (sin pasar por Gemini)."""

import json
from unittest.mock import patch

import pytest

from app.models.order import Order
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
        args["canal"] = "telegram"
        args["chat_id"] = chat_id
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


def test_si_el_nombre_coincide_con_varios_productos_pregunta_cual(db_session, products):
    from app.models.menu import Product

    db_session.add(Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id))
    db_session.commit()

    respuesta = _calcular(items_solicitados="1 pizza, 1 Coca-Cola 500ml")

    assert "'pizza' puede ser: Pizza Muzzarella, Pizza Napolitana. ¿Cuál querés?" in respuesta["mensaje_para_usuario"]
    assert [i["nombre"] for i in respuesta["datos_temporales"]["items"]] == ["Coca-Cola 500ml"]
    assert respuesta["datos_temporales"]["faltan_datos"] is True


def test_si_todos_los_productos_son_ambiguos_solo_pregunta(db_session, products):
    from app.models.menu import Product

    db_session.add(Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id))
    db_session.commit()

    resultado = calcular_y_preparar_pedido.invoke({"items_solicitados": "1 pizza"})

    assert resultado.startswith("Necesito que me aclares algunos productos:")
    assert "Pizza Muzzarella, Pizza Napolitana" in resultado


def test_el_nombre_exacto_gana_aunque_otro_producto_lo_contenga(db_session, products):
    from app.models.menu import Product

    db_session.add(Product(name="Pizza Muzzarella Grande", price=12000.0, category_id=products["muzza"].category_id))
    db_session.commit()

    datos = _calcular(items_solicitados="1 pizza muzzarella")["datos_temporales"]

    assert [i["nombre"] for i in datos["items"]] == ["Pizza Muzzarella"]


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
    assert (order.channel, order.chat_id) == ("telegram", "98765")
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

    assert "no están disponibles en este momento: Pizza Agotada" in resultado
    assert db_session.query(Order).count() == 0


def test_respeta_el_maximo_por_producto_igual_que_la_web(db_session, products):
    resultado = _confirmar(_datos(products, items=[{"product_id": products["muzza"].id, "quantity": 500}]))

    assert "NO se registró" in resultado
    assert "cantidad máxima (20 unidades)" in resultado
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


def test_calcular_y_preparar_pedido_ofrece_efectivo_y_mercadopago(products):
    res = _calcular(
        items_solicitados="1 Pizza Muzzarella",
        customer_name="Juan",
        customer_phone="1144445555",
        shipping_address="Calle 123",
        metodo_entrega="domicilio",
    )
    assert res["datos_temporales"]["faltan_datos"] is False
    assert "Efectivo" in res["mensaje_para_usuario"]
    assert "MercadoPago" in res["mensaje_para_usuario"]


def test_confirmar_y_guardar_pedido_con_mercadopago_genera_link_y_guarda_metodo(db_session, products):
    datos = _datos(products, metodo_pago="mercadopago")
    resultado = _confirmar(datos)

    assert "Recibimos tu pedido" in resultado
    assert "MercadoPago" in resultado
    assert "Link de pago" in resultado
    assert "mercadopago.com.ar" in resultado
    assert "$17,000.00" in resultado or "$ 17,000.00" in resultado or "17,000.00" in resultado

    order = db_session.query(Order).one()
    assert order.payment_method == "mercadopago"
    assert order.is_paid is False
    assert order.mp_preference_id is not None


def test_confirmar_y_guardar_pedido_con_alias_lo_incluye_en_respuesta(db_session, products):
    from app.services.store_config_service import get_or_create_store_config

    config = get_or_create_store_config(db_session)
    config.mp_alias = "mipizzeria.mp"
    db_session.commit()

    datos = _datos(products, metodo_pago="mercadopago")
    resultado = _confirmar(datos)

    assert "mipizzeria.mp" in resultado


# --- Pizzas Mitad y Mitad ---


def test_pizza_mitad_y_mitad_calcula_precio_con_el_gusto_mas_caro(db_session, products):
    from app.models.menu import Product

    napo = Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id)
    db_session.add(napo)
    db_session.commit()

    # Muzza cuesta 8500, Napo cuesta 9500 -> Debe costar 9500 (el gusto más caro)
    respuesta = _calcular(items_solicitados="una grande mitad muzzarella, mitad napolitana")
    datos = respuesta["datos_temporales"]

    assert datos["total"] == 9500.0
    assert len(datos["items"]) == 1
    item = datos["items"][0]
    assert item["nombre"] == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"
    assert item["unit_price"] == 9500.0
    assert item["quantity"] == 1
    assert item["product_id"] == products["muzza"].id
    assert item["secondary_product_id"] == napo.id


def test_pizza_mitad_y_mitad_cuando_primer_gusto_es_el_mas_caro(db_session, products):
    from app.models.menu import Product

    roquefort = Product(name="Pizza Roquefort", price=10800.0, category_id=products["muzza"].category_id)
    db_session.add(roquefort)
    db_session.commit()

    # Roquefort cuesta 10800, Muzza cuesta 8500 -> Debe costar 10800
    respuesta = _calcular(items_solicitados="1 pizza mitad roquefort y mitad muzzarella")
    datos = respuesta["datos_temporales"]

    assert datos["total"] == 10800.0
    item = datos["items"][0]
    assert item["nombre"] == "Pizza [1/2 Roquefort | 1/2 Muzzarella]"
    assert item["unit_price"] == 10800.0


def test_pizza_mitad_y_mitad_mismo_precio_ambos_gustos(db_session, products):
    from app.models.menu import Product

    especial = Product(name="Pizza Especial", price=8500.0, category_id=products["muzza"].category_id)
    db_session.add(especial)
    db_session.commit()

    respuesta = _calcular(items_solicitados="1 pizza mitad muzzarella, mitad especial")
    datos = respuesta["datos_temporales"]

    assert datos["total"] == 8500.0
    assert datos["items"][0]["unit_price"] == 8500.0


def test_restriccion_ui_bot_solo_informa_precio_total_sin_explicar_regla_de_cobro(db_session, products):
    from app.models.menu import Product

    napo = Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id)
    db_session.add(napo)
    db_session.commit()

    respuesta = _calcular(items_solicitados="una grande mitad muzzarella, mitad napolitana")
    mensaje = respuesta["mensaje_para_usuario"]

    # Muestra el ítem con su total
    assert "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana] (x1) $9,500.00" in mensaje
    assert "Total: $9,500.00" in mensaje

    # Restricción: No debe explicar la regla ni justificar el cobro al cliente
    prohibidas = ["más caro", "mas caro", "mayor valor", "regla", "política", "politica", "gusto más caro", "gusto mas caro", "criterio"]
    for frase in prohibidas:
        assert frase not in mensaje.lower(), f"El mensaje del bot no debe contener la explicación: '{frase}'"


def test_pizza_mitad_y_mitad_acepta_formato_corchetes(db_session, products):
    from app.models.menu import Product

    napo = Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id)
    db_session.add(napo)
    db_session.commit()

    respuesta = _calcular(items_solicitados="1x Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]")
    datos = respuesta["datos_temporales"]

    assert datos["total"] == 9500.0
    assert datos["items"][0]["nombre"] == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"


def test_pizza_mitad_y_mitad_con_cantidad_multiple(db_session, products):
    from app.models.menu import Product

    napo = Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id)
    db_session.add(napo)
    db_session.commit()

    respuesta = _calcular(items_solicitados="2 grandes mitad muzzarella, mitad napolitana")
    datos = respuesta["datos_temporales"]

    assert datos["total"] == 9500.0 * 2
    assert datos["items"][0]["quantity"] == 2
    assert datos["items"][0]["unit_price"] == 9500.0


def test_pizza_mitad_y_mitad_junto_con_otros_productos(db_session, products):
    from app.models.menu import Product

    napo = Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id)
    db_session.add(napo)
    db_session.commit()

    respuesta = _calcular(items_solicitados="1 grande mitad muzzarella, mitad napolitana, 2 Coca-Cola 500ml")
    datos = respuesta["datos_temporales"]

    # Pizza (9500) + 2 Coca-Cola (2 x 2500 = 5000) = 14500
    assert datos["total"] == 9500.0 + 5000.0
    assert len(datos["items"]) == 2
    assert datos["items"][0]["nombre"] == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"
    assert datos["items"][1]["nombre"] == "Coca-Cola 500ml"


def test_pizza_mitad_y_mitad_sabor_no_encontrado(db_session, products):
    # Si la única pizza tiene un sabor que no existe, no se reconoce ningún ítem válido
    resultado = calcular_y_preparar_pedido.invoke({"items_solicitados": "una grande mitad muzzarella, mitad sushi"})
    assert resultado == "No se pudieron reconocer productos válidos en el menú para tu pedido."

    # Si acompaña a otro producto válido, se informa el sabor faltante en el resumen
    respuesta = _calcular(items_solicitados="1 Coca-Cola 500ml, 1 grande mitad muzzarella, mitad sushi")
    mensaje = respuesta["mensaje_para_usuario"]
    assert "No pudimos encontrar el sabor: 'sushi'" in mensaje
    assert len(respuesta["datos_temporales"]["items"]) == 1


def test_pizza_mitad_y_mitad_persiste_en_bd_unificada(db_session, products):
    from app.models.menu import Product

    napo = Product(name="Pizza Napolitana", price=9500.0, category_id=products["muzza"].category_id)
    db_session.add(napo)
    db_session.commit()

    calculo = _calcular(
        items_solicitados="una grande mitad muzzarella, mitad napolitana",
        customer_name="Juan Perez",
        customer_phone="11 5555-6666",
        shipping_address="Av. Corrientes 1234",
        metodo_entrega="domicilio",
        metodo_pago="efectivo",
    )
    datos = calculo["datos_temporales"]

    resultado_confirmar = _confirmar(datos)
    assert "Recibimos tu pedido" in resultado_confirmar

    order = db_session.query(Order).one()
    assert len(order.items) == 1
    item = order.items[0]
    assert item.quantity == 1
    assert item.unit_price == 9500.0
    assert item.display_name == "Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]"
    assert item.product_id == products["muzza"].id
    assert item.secondary_product_id == napo.id
    assert order.total_amount == 9500.0

