import json
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.core.time import RESTAURANT_TZ
from app.modules.order import Order
from app.services.order_service import calcular_demora_actual
from app.services.tools.order_tools import (
    _parsear_hora,
    calcular_y_preparar_pedido,
    confirmar_y_guardar_pedido,
)
from tests.conftest import TestingSessionLocal


@pytest.fixture(autouse=True)
def tools_session(db_session):
    """Las tools abren su propia sesión: las apuntamos a la base de test."""
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal):
        yield


def _fijar_hora_local(hora: int, minuto: int = 0):
    ahora = datetime(2026, 9, 28, hora, minuto, tzinfo=RESTAURANT_TZ)
    return patch("app.services.tools.order_tools.ahora_local", return_value=ahora)


def _agregar_pedidos(db_session, status: str, cantidad: int):
    for _ in range(cantidad):
        db_session.add(Order(customer_name="X", shipping_address="Y", total_amount=1.0, status=status))
    db_session.commit()


def _datos_pedido(muzza, hora_programada=None, **extra):
    return json.dumps({
        "items": [{"product_id": muzza.id, "quantity": 1, "unit_price": muzza.price}],
        "total": muzza.price,
        "cliente": "Paula",
        "direccion": "Retiro en el local",
        "metodo_entrega": "retiro",
        "hora_programada": hora_programada,
        "telefono": "11 4444-5555",
        **extra,
    })


def test_demora_minima_es_15_minutos(db_session):
    assert calcular_demora_actual(db_session) == 15


def test_demora_suma_3_minutos_por_pedido_en_proceso(db_session):
    _agregar_pedidos(db_session, "Confirmado", 4)
    _agregar_pedidos(db_session, "Pendiente", 2)
    _agregar_pedidos(db_session, "En Camino", 1)
    _agregar_pedidos(db_session, "Listo para Retirar", 1)

    assert calcular_demora_actual(db_session) == 15 + 4 * 3


@pytest.mark.parametrize("texto", ["21", "21:00", "21.00hs", "21 hs", "21h00", "2100"])
def test_parsea_formatos_de_hora(texto):
    assert _parsear_hora(texto).strftime("%H:%M") == "21:00"


def test_pedido_programado_se_guarda_en_la_hora_local_pedida(db_session, muzza):
    with _fijar_hora_local(17):
        resultado = confirmar_y_guardar_pedido.invoke({"datos_pedido_json": _datos_pedido(muzza, "21:00")})

    assert "21:00" in resultado
    order = db_session.query(Order).one()
    scheduled = order.scheduled_for
    if scheduled.tzinfo is None:  # SQLite no conserva la zona horaria
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    assert scheduled.astimezone(RESTAURANT_TZ).strftime("%H:%M") == "21:00"


def test_horario_anterior_a_la_demora_informa_el_horario_mas_rapido(db_session, muzza):
    _agregar_pedidos(db_session, "Confirmado", 3)  # demora = 15 + 9 = 24 minutos

    with _fijar_hora_local(20, 50):
        respuesta = json.loads(calcular_y_preparar_pedido.invoke({
            "items_solicitados": "1 Pizza Muzzarella",
            "customer_name": "Paula",
            "customer_phone": "11 4444-5555",
            "metodo_entrega": "retiro",
            "hora_programada": "21:00",
        }))

    assert "21:14" in respuesta["mensaje_para_usuario"]
    assert respuesta["datos_temporales"]["hora_programada"] is None
    assert respuesta["datos_temporales"]["faltan_datos"] is True


def test_no_registra_pedido_con_horario_anterior_a_la_demora(db_session, muzza):
    _agregar_pedidos(db_session, "Confirmado", 3)

    with _fijar_hora_local(20, 50):
        resultado = confirmar_y_guardar_pedido.invoke({"datos_pedido_json": _datos_pedido(muzza, "21:00")})

    assert "21:14" in resultado
    assert db_session.query(Order).filter(Order.customer_name == "Paula").count() == 0


def test_horario_valido_se_confirma_con_hora_normalizada(db_session, muzza):
    with _fijar_hora_local(17):
        respuesta = json.loads(calcular_y_preparar_pedido.invoke({
            "items_solicitados": "1 Pizza Muzzarella",
            "customer_name": "Paula",
            "customer_phone": "11 4444-5555",
            "metodo_entrega": "retiro",
            "hora_programada": "21.30hs",
        }))

    assert respuesta["datos_temporales"]["hora_programada"] == "21:30"
    assert respuesta["datos_temporales"]["faltan_datos"] is False
    assert "para las 21:30" in respuesta["mensaje_para_usuario"]


def test_resumen_final_muestra_productos_y_datos_de_entrega(db_session, muzza):
    with _fijar_hora_local(17):
        respuesta = json.loads(calcular_y_preparar_pedido.invoke({
            "items_solicitados": "2 Pizza Muzzarella",
            "customer_name": "Paula",
            "customer_phone": "11 4444-5555",
            "metodo_entrega": "domicilio",
            "shipping_address": "Belgrano 95",
            "hora_programada": "21:00",
            "observaciones": "Sin cebolla",
        }))

    resumen = respuesta["mensaje_para_usuario"]
    for esperado in (
        "Pizza Muzzarella (x2) $17,000.00",
        "Total: $17,000.00",
        "Nombre: Paula",
        "Teléfono: 11 4444-5555",
        "Envío a domicilio: Belgrano 95",
        "Horario: para las 21:00",
        "Observaciones: Sin cebolla",
        "¿Está todo bien para confirmar el pedido?",
    ):
        assert esperado in resumen


def test_bot_guarda_telefono_y_observaciones(db_session, muzza):
    resultado = confirmar_y_guardar_pedido.invoke(
        {"datos_pedido_json": _datos_pedido(muzza, observaciones="  Sin cebolla, timbre 2B ")}
    )

    assert "Listo" in resultado
    assert "Todavía no está confirmado" in resultado
    order = db_session.query(Order).one()
    assert order.customer_phone == "11 4444-5555"
    assert order.notes == "Sin cebolla, timbre 2B"


def test_bot_no_registra_pedido_sin_telefono(db_session, muzza):
    resultado = confirmar_y_guardar_pedido.invoke({"datos_pedido_json": _datos_pedido(muzza, telefono=None)})

    assert "teléfono" in resultado
    assert db_session.query(Order).count() == 0


def test_resumen_pide_telefono_y_muestra_observaciones(db_session, muzza):
    sin_telefono = json.loads(calcular_y_preparar_pedido.invoke({
        "items_solicitados": "1 Pizza Muzzarella",
        "customer_name": "Paula",
        "metodo_entrega": "retiro",
    }))
    assert sin_telefono["datos_temporales"]["faltan_datos"] is True
    assert "teléfono" in sin_telefono["mensaje_para_usuario"]

    completo = json.loads(calcular_y_preparar_pedido.invoke({
        "items_solicitados": "1 Pizza Muzzarella",
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "metodo_entrega": "retiro",
        "observaciones": "Sin cebolla",
    }))
    assert completo["datos_temporales"]["observaciones"] == "Sin cebolla"
    assert "Sin cebolla" in completo["mensaje_para_usuario"]
