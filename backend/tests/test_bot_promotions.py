"""El bot detecta solo las promos que arma lo que pidió el cliente (sin agregar productos de más)."""

import json
from unittest.mock import patch

import pytest

from app.models.menu import Product
from app.models.promotion import Promotion
from app.services.tools.order_tools import calcular_y_preparar_pedido
from tests.conftest import TestingSessionLocal


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal):
        yield


def _promo(db_session, name, price, items, **extra) -> Promotion:
    promo = Promotion(name=name, price=price, **extra)
    promo.set_products(items)
    db_session.add(promo)
    db_session.commit()
    return promo


@pytest.fixture()
def promo_muzza_coca(db_session, products):
    return _promo(db_session, "Muzzarella + Coca-Cola 500ml", 10500, [(products["muzza"], 1), (products["coca"], 1)])


def _calcular(items: str) -> dict:
    return json.loads(calcular_y_preparar_pedido.invoke({"items_solicitados": items}))


def _resumen(respuesta: dict) -> list[tuple]:
    return [(i["nombre"], i["quantity"], i["unit_price"]) for i in respuesta["datos_temporales"]["items"]]


def test_una_muzza_y_una_coca_arman_la_promo_sin_pizza_de_mas(promo_muzza_coca):
    respuesta = _calcular("1 Pizza Muzzarella, 1 Coca-Cola 500ml")

    assert _resumen(respuesta) == [("Muzzarella + Coca-Cola 500ml", 1, 10500.0)]
    assert respuesta["datos_temporales"]["total"] == 10500.0
    assert "ahorrás" not in respuesta["mensaje_para_usuario"]
    assert "- Promo: Muzzarella + Coca-Cola 500ml (x1) $10,500.00" in respuesta["mensaje_para_usuario"]
    assert "Pizza Muzzarella (x" not in respuesta["mensaje_para_usuario"]


def test_el_pedido_se_registra_con_el_precio_de_la_promo(db_session, promo_muzza_coca):
    from app.models.order import Order
    from app.services.tools.order_tools import confirmar_y_guardar_pedido

    datos = _calcular("1 Pizza Muzzarella, 1 Coca-Cola 500ml")["datos_temporales"]
    datos.update(cliente="Ana", telefono="1155551234", metodo_entrega="retiro", metodo_pago="efectivo")
    confirmar_y_guardar_pedido.invoke({"datos_pedido_json": json.dumps(datos), "canal": "telegram", "chat_id": "1"})

    pedido = db_session.query(Order).one()
    assert float(pedido.total_amount) == 10500.0


def test_el_orden_de_lo_pedido_no_importa(promo_muzza_coca):
    respuesta = _calcular("1 Coca-Cola 500ml, 1 Pizza Muzzarella")

    assert _resumen(respuesta) == [("Muzzarella + Coca-Cola 500ml", 1, 10500.0)]


def test_lo_que_sobra_de_la_promo_se_cobra_normal(promo_muzza_coca):
    respuesta = _calcular("3 Pizza Muzzarella, 1 Coca-Cola 500ml")

    assert _resumen(respuesta) == [
        ("Muzzarella + Coca-Cola 500ml", 1, 10500.0),
        ("Pizza Muzzarella", 2, 8500.0),
    ]
    assert respuesta["datos_temporales"]["total"] == 10500.0 + 2 * 8500.0


def test_se_arma_la_promo_las_veces_que_entra(promo_muzza_coca):
    respuesta = _calcular("2 Pizza Muzzarella, 2 Coca-Cola 500ml")

    assert _resumen(respuesta) == [("Muzzarella + Coca-Cola 500ml", 2, 10500.0)]
    assert respuesta["datos_temporales"]["total"] == 21000.0


def test_sin_los_productos_de_la_promo_completos_no_se_aplica(promo_muzza_coca):
    respuesta = _calcular("2 Pizza Muzzarella")

    assert _resumen(respuesta) == [("Pizza Muzzarella", 2, 8500.0)]


def test_un_producto_modificado_no_entra_en_la_promo(promo_muzza_coca):
    respuesta = _calcular("1 Pizza Muzzarella sin cebolla, 1 Coca-Cola 500ml")

    assert all(item["promotion_id"] is None for item in respuesta["datos_temporales"]["items"] if "promotion_id" in item)
    assert respuesta["datos_temporales"]["total"] == 8500.0 + 2500.0


def test_si_la_promo_no_conviene_no_se_aplica(db_session, products):
    _promo(db_session, "Combo caro", 12000, [(products["muzza"], 1), (products["coca"], 1)])

    respuesta = _calcular("1 Pizza Muzzarella, 1 Coca-Cola 500ml")

    assert respuesta["datos_temporales"]["total"] == 11000.0
    assert len(respuesta["datos_temporales"]["items"]) == 2


def test_una_promo_inactiva_no_se_aplica(db_session, products):
    _promo(db_session, "Combo viejo", 10000, [(products["muzza"], 1), (products["coca"], 1)], is_active=False)

    respuesta = _calcular("1 Pizza Muzzarella, 1 Coca-Cola 500ml")

    assert respuesta["datos_temporales"]["total"] == 11000.0


def test_si_el_cliente_nombra_la_promo_se_respeta(promo_muzza_coca):
    respuesta = _calcular("1 Muzzarella + Coca-Cola 500ml")

    assert _resumen(respuesta) == [("Muzzarella + Coca-Cola 500ml", 1, 10500.0)]


def test_si_ademas_hay_otros_productos_conviene_la_promo_que_mas_ahorra(db_session, products, promo_muzza_coca):
    pepsi = Product(name="Pepsi 500ml", price=2500.0, category_id=products["muzza"].category_id, dietary_restrictions=[])
    db_session.add(pepsi)
    db_session.commit()

    respuesta = _calcular("1 Pizza Muzzarella, 1 Coca-Cola 500ml, 1 Pepsi 500ml")

    assert respuesta["datos_temporales"]["total"] == 10500.0 + 2500.0
    nombres = [i["nombre"] for i in respuesta["datos_temporales"]["items"]]
    assert nombres == ["Muzzarella + Coca-Cola 500ml", "Pepsi 500ml"]


def test_la_promo_se_suma_a_la_que_ya_nombro_el_cliente(promo_muzza_coca):
    respuesta = _calcular("1 Muzzarella + Coca-Cola 500ml, 1 Pizza Muzzarella, 1 Coca-Cola 500ml")

    assert _resumen(respuesta) == [("Muzzarella + Coca-Cola 500ml", 2, 10500.0)]
    assert respuesta["datos_temporales"]["total"] == 21000.0


def test_un_nombre_parcial_que_no_es_un_producto_se_toma_como_la_promo(db_session, products):
    _promo(db_session, "Promo 2x1 Pizzas", 8500, [(products["muzza"], 2)])

    respuesta = _calcular("1 Promo 2x1")

    assert _resumen(respuesta) == [("Promo 2x1 Pizzas", 1, 8500.0)]


def test_pedir_la_coca_sola_no_trae_la_promo_que_la_contiene(promo_muzza_coca):
    respuesta = _calcular("1 Coca-Cola 500ml")

    assert _resumen(respuesta) == [("Coca-Cola 500ml", 1, 2500.0)]
