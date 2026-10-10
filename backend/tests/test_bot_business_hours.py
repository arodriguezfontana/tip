"""El bot respeta los horarios de atención: con el local cerrado solo toma pedidos programados."""

import json
from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import patch

import pytest

from app.core.time import RESTAURANT_TZ
from app.modules.order import Order
from app.services.business_hours_service import Franja, guardar_franjas
from app.services.tools.horario_tools import obtener_estado_del_local
from app.services.tools.order_tools import _parsear_dia, calcular_y_preparar_pedido, confirmar_y_guardar_pedido
from tests.conftest import TestingSessionLocal

LUNES, MARTES, SABADO, DOMINGO = 0, 1, 5, 6


def _momento(dia: int, hora: int, minuto: int = 0) -> datetime:
    """Momento de una semana de prueba que empieza el lunes 28/09/2026."""
    return datetime(2026, 9, 28, hora, minuto, tzinfo=RESTAURANT_TZ) + timedelta(days=dia)


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.horario_tools.SessionLocal", TestingSessionLocal):
        yield


@pytest.fixture()
def horarios(db_session):
    """Martes a domingo de 12 a 15 y de 20 a 00. Lunes cerrado."""
    guardar_franjas(db_session, [
        Franja(dia=dia, apertura=time.fromisoformat(apertura), cierre=time.fromisoformat(cierre))
        for dia in range(MARTES, DOMINGO + 1)
        for apertura, cierre in (("12:00", "15:00"), ("20:00", "00:00"))
    ])


def _fijar_ahora(momento: datetime):
    return patch("app.services.tools.order_tools.ahora_local", return_value=momento)


def _calcular(hora_programada=None, dia_programado=None):
    return json.loads(calcular_y_preparar_pedido.invoke({
        "items_solicitados": "1 Pizza Muzzarella",
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "metodo_entrega": "retiro",
        "hora_programada": hora_programada,
        "dia_programado": dia_programado,
    }))


def _confirmar(muzza, **datos):
    return confirmar_y_guardar_pedido.invoke({"datos_pedido_json": json.dumps({
        "items": [{"product_id": muzza.id, "quantity": 1}],
        "cliente": "Paula",
        "metodo_entrega": "retiro",
        "telefono": "11 4444-5555",
        **datos,
    })})


def _programado_local(order: Order) -> datetime:
    programado = order.scheduled_for
    if programado.tzinfo is None:  # SQLite no conserva la zona horaria
        programado = programado.replace(tzinfo=timezone.utc)
    return programado.astimezone(RESTAURANT_TZ)


def test_con_el_local_cerrado_no_toma_pedidos_para_ahora(muzza, horarios):
    with _fijar_ahora(_momento(MARTES, 17)):
        respuesta = _calcular()

    mensaje = respuesta["mensaje_para_usuario"]
    assert "el local está cerrado" in mensaje
    assert "Volvemos a abrir hoy a las 20:00" in mensaje
    assert "- Lunes: cerrado" in mensaje
    assert "- Martes: 12:00 a 15:00 y 20:00 a 00:00" in mensaje
    assert "programamos" in mensaje
    assert respuesta["datos_temporales"]["faltan_datos"] is True


def test_con_el_local_cerrado_no_registra_pedidos_para_ahora(db_session, muzza, horarios):
    with _fijar_ahora(_momento(LUNES, 21)):
        resultado = _confirmar(muzza)

    assert "NO se registró" in resultado
    assert db_session.query(Order).count() == 0


def test_con_el_local_cerrado_se_puede_programar_para_cuando_abra(db_session, muzza, horarios):
    with _fijar_ahora(_momento(MARTES, 17)):
        respuesta = _calcular("21:00")
        resultado = _confirmar(muzza, **{k: respuesta["datos_temporales"][k] for k in ("hora_programada", "dia_programado")})

    assert respuesta["datos_temporales"]["faltan_datos"] is False
    assert "para las 21:00" in respuesta["mensaje_para_usuario"]
    assert "Recibimos tu pedido para las 21:00" in resultado
    assert _programado_local(db_session.query(Order).one()) == _momento(MARTES, 21)


def test_horario_en_que_el_local_esta_cerrado_se_rechaza_con_los_horarios(muzza, horarios):
    with _fijar_ahora(_momento(MARTES, 13)):
        respuesta = _calcular("17:00")

    mensaje = respuesta["mensaje_para_usuario"]
    assert "El local está cerrado" in mensaje
    assert "- Martes: 12:00 a 15:00 y 20:00 a 00:00" in mensaje
    assert respuesta["datos_temporales"]["hora_programada"] is None
    assert respuesta["datos_temporales"]["faltan_datos"] is True


def test_con_el_local_cerrado_una_hora_que_ya_paso_se_programa_para_el_dia_siguiente(muzza, horarios):
    # Martes 17:00, entre turnos: el mediodía de hoy ya pasó, así que "para las 13" es mañana.
    with _fijar_ahora(_momento(MARTES, 17)):
        respuesta = _calcular("13:00")

    assert respuesta["datos_temporales"]["dia_programado"] == "2026-09-30"
    assert "para mañana a las 13:00" in respuesta["mensaje_para_usuario"]


def test_si_hoy_no_abre_se_programa_para_el_proximo_dia_abierto(db_session, muzza, horarios):
    # Los lunes el local está cerrado: "para las 21" es el martes.
    with _fijar_ahora(_momento(LUNES, 10)):
        respuesta = _calcular("21:00")
        datos = respuesta["datos_temporales"]
        resultado = _confirmar(muzza, hora_programada=datos["hora_programada"], dia_programado=datos["dia_programado"])

    assert datos["dia_programado"] == "2026-09-29"
    assert "para mañana a las 21:00" in respuesta["mensaje_para_usuario"]
    assert "Recibimos tu pedido para mañana a las 21:00" in resultado
    assert _programado_local(db_session.query(Order).one()) == _momento(MARTES, 21)


def test_con_el_local_abierto_una_hora_que_ya_paso_sigue_siendo_de_hoy(muzza, horarios):
    with _fijar_ahora(_momento(MARTES, 21)):
        respuesta = _calcular("13:00")

    assert "lo más rápido que podemos tener tu pedido es a las 21:15" in respuesta["mensaje_para_usuario"]
    assert respuesta["datos_temporales"]["hora_programada"] is None


def test_programa_para_el_dia_que_indica_el_cliente(muzza, horarios):
    with _fijar_ahora(_momento(MARTES, 13)):
        respuesta = _calcular("21:00", "el sábado")

    assert respuesta["datos_temporales"]["dia_programado"] == "2026-10-03"
    assert "para el sábado 03/10 a las 21:00" in respuesta["mensaje_para_usuario"]


def test_rechaza_el_dia_indicado_si_el_local_esta_cerrado(muzza, horarios):
    with _fijar_ahora(_momento(MARTES, 13)):
        respuesta = _calcular("21:00", "lunes")

    assert "El local está cerrado el lunes 05/10 a las 21:00" in respuesta["mensaje_para_usuario"]
    assert respuesta["datos_temporales"]["faltan_datos"] is True


def test_sin_horarios_configurados_el_bot_toma_pedidos_a_cualquier_hora(db_session, muzza):
    with _fijar_ahora(_momento(LUNES, 4)):
        resultado = _confirmar(muzza)

    assert "Recibimos tu pedido" in resultado
    assert db_session.query(Order).count() == 1


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("hoy", date(2026, 9, 29)),
        ("Mañana", date(2026, 9, 30)),
        ("pasado mañana", date(2026, 10, 1)),
        ("el sabado", date(2026, 10, 3)),
        ("martes", date(2026, 9, 29)),
        ("lunes", date(2026, 10, 5)),
        ("3/10", date(2026, 10, 3)),
        ("2026-10-02", date(2026, 10, 2)),
        ("1/1", date(2027, 1, 1)),
        ("algún día", None),
        ("31/02", None),
    ],
)
def test_parsea_el_dia_pedido(texto, esperado):
    assert _parsear_dia(texto, date(2026, 9, 29)) == esperado


# --- Instrucciones del bot ------------------------------------------------------------------------


def _estado_del_bot(momento: datetime) -> str:
    with patch("app.services.business_hours_service.ahora_local", return_value=momento):
        return obtener_estado_del_local()


def test_el_bot_sabe_que_el_local_esta_cerrado_y_debe_ofrecer_programar(horarios):
    texto = _estado_del_bot(_momento(LUNES, 21))

    assert "FECHA Y HORA ACTUAL DEL LOCAL: lunes 28/09/2026 21:00" in texto
    assert "ESTADO DEL LOCAL: CERRADO. Vuelve a abrir mañana a las 12:00." in texto
    assert "- Lunes: cerrado" in texto
    assert "REGLA DE LOCAL CERRADO" in texto
    assert "programar un pedido" in texto


def test_el_bot_sabe_que_el_local_esta_abierto(horarios):
    texto = _estado_del_bot(_momento(MARTES, 21))

    assert "ESTADO DEL LOCAL: ABIERTO (cierra a las 00:00)." in texto
    assert "REGLA DE LOCAL CERRADO" not in texto


def test_sin_horarios_configurados_el_bot_no_recibe_instrucciones_de_horario():
    assert _estado_del_bot(_momento(LUNES, 21)) == ""
