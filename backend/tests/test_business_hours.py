"""Horarios de atención del local: configuración desde el panel y restricción de los pedidos web."""

from datetime import datetime, time, timedelta
from unittest.mock import patch

import pytest

from app.core.time import RESTAURANT_TZ
from app.modules.order import Order
from app.services.business_hours_service import (
    Franja,
    HorarioInvalidoError,
    esta_abierto,
    guardar_franjas,
    hora_de_cierre,
    proxima_apertura,
    validar_franjas,
)

URL = "/api/v1/business-hours"
WEB_ORDERS_URL = "/api/v1/orders/web"

LUNES, MARTES, MIERCOLES, VIERNES, SABADO, DOMINGO = 0, 1, 2, 4, 5, 6


def _momento(dia: int, hora: int, minuto: int = 0) -> datetime:
    """Momento de una semana de prueba que empieza el lunes 28/09/2026."""
    return datetime(2026, 9, 28, hora, minuto, tzinfo=RESTAURANT_TZ) + timedelta(days=dia)


def _franja(dia: int, apertura: str, cierre: str) -> Franja:
    return Franja(dia=dia, apertura=time.fromisoformat(apertura), cierre=time.fromisoformat(cierre))


# Martes a domingo de 12 a 15 y de 20 a 00; el sábado la noche sigue hasta las 02. Lunes cerrado.
HORARIOS = [
    franja
    for dia in range(MARTES, DOMINGO + 1)
    for franja in (_franja(dia, "12:00", "15:00"), _franja(dia, "20:00", "02:00" if dia == SABADO else "00:00"))
]


def _fijar_ahora(momento: datetime):
    return patch("app.services.business_hours_service.ahora_local", return_value=momento)


@pytest.fixture()
def horarios(db_session):
    guardar_franjas(db_session, HORARIOS)
    return HORARIOS


# --- Cálculo de apertura ---------------------------------------------------------------------------


def test_sin_horarios_configurados_el_local_no_restringe_pedidos():
    assert esta_abierto([], _momento(LUNES, 4))


@pytest.mark.parametrize(
    ("momento", "abierto"),
    [
        (_momento(MARTES, 12), True),
        (_momento(MARTES, 14, 59), True),
        (_momento(MARTES, 15), False),  # el cierre no está incluido
        (_momento(MARTES, 17), False),
        (_momento(MARTES, 23, 59), True),
        (_momento(MIERCOLES, 0, 30), False),
        (_momento(LUNES, 13), False),
        (_momento(DOMINGO, 1, 30), True),  # la noche del sábado sigue hasta las 02
        (_momento(DOMINGO, 2), False),
    ],
)
def test_esta_abierto_segun_franjas(momento, abierto):
    assert esta_abierto(HORARIOS, momento) is abierto


def test_franja_del_domingo_que_pasa_la_medianoche_sigue_abierta_el_lunes():
    franjas = [_franja(DOMINGO, "22:00", "03:00")]

    assert esta_abierto(franjas, _momento(LUNES, 2, 59))
    assert not esta_abierto(franjas, _momento(LUNES, 3))
    assert hora_de_cierre(franjas, _momento(DOMINGO, 23)) == _momento(DOMINGO + 1, 3)


def test_proxima_apertura_salta_los_dias_cerrados():
    # Lunes cerrado: abre el martes al mediodía.
    assert proxima_apertura(HORARIOS, _momento(LUNES, 0, 30)) == _momento(MARTES, 12)
    assert proxima_apertura(HORARIOS, _momento(LUNES, 10)) == _momento(MARTES, 12)
    assert proxima_apertura(HORARIOS, _momento(MARTES, 16, 30)) == _momento(MARTES, 20)


def test_hora_de_cierre_de_la_franja_actual():
    assert hora_de_cierre(HORARIOS, _momento(MARTES, 21)) == _momento(MIERCOLES, 0)
    assert hora_de_cierre(HORARIOS, _momento(SABADO, 23)) == _momento(DOMINGO, 2)


# --- Validación de la configuración ---------------------------------------------------------------


def test_no_se_puede_dejar_el_local_sin_horarios():
    with pytest.raises(HorarioInvalidoError, match="al menos una franja"):
        validar_franjas([])


def test_rechaza_franja_con_la_misma_hora_de_apertura_y_cierre():
    with pytest.raises(HorarioInvalidoError, match="misma hora"):
        validar_franjas([_franja(MARTES, "12:00", "12:00")])


def test_rechaza_franjas_superpuestas_del_mismo_dia():
    with pytest.raises(HorarioInvalidoError, match="se superpone"):
        validar_franjas([_franja(MARTES, "12:00", "16:00"), _franja(MARTES, "15:00", "18:00")])


def test_rechaza_franja_nocturna_que_pisa_la_del_dia_siguiente():
    with pytest.raises(HorarioInvalidoError, match="sábado"):
        validar_franjas([_franja(SABADO, "20:00", "02:00"), _franja(DOMINGO, "01:00", "05:00")])


def test_rechaza_franja_del_domingo_que_pisa_la_del_lunes():
    with pytest.raises(HorarioInvalidoError, match="se superpone"):
        validar_franjas([_franja(LUNES, "01:00", "05:00"), _franja(DOMINGO, "22:00", "02:00")])


def test_acepta_franjas_contiguas():
    validar_franjas([_franja(MARTES, "12:00", "15:00"), _franja(MARTES, "15:00", "18:00")])


# --- API ------------------------------------------------------------------------------------------


def test_sin_configurar_el_local_figura_abierto(public_client):
    response = public_client.get(URL)

    assert response.status_code == 200
    assert response.json() == {
        "configured": False,
        "is_open": True,
        "closes_at": None,
        "next_opening": None,
        "next_opening_label": None,
        "ranges": [],
    }


def test_estado_publico_con_el_local_cerrado(public_client, horarios):
    with _fijar_ahora(_momento(LUNES, 10)):
        body = public_client.get(URL).json()

    assert body["configured"] is True
    assert body["is_open"] is False
    assert body["next_opening_label"] == "mañana a las 12:00"
    assert datetime.fromisoformat(body["next_opening"]) == _momento(MARTES, 12)
    assert {"day_of_week": SABADO, "opens_at": "20:00", "closes_at": "02:00"} in body["ranges"]
    assert len(body["ranges"]) == len(HORARIOS)


def test_estado_publico_con_el_local_abierto(public_client, horarios):
    with _fijar_ahora(_momento(MARTES, 21)):
        body = public_client.get(URL).json()

    assert body["is_open"] is True
    assert body["next_opening"] is None
    assert datetime.fromisoformat(body["closes_at"]) == _momento(MIERCOLES, 0)


def test_admin_configura_los_horarios(client, db_session):
    ranges = [
        {"day_of_week": VIERNES, "opens_at": "20:00", "closes_at": "23:30"},
        {"day_of_week": MARTES, "opens_at": "12:00", "closes_at": "15:00"},
    ]

    response = client.put(URL, json={"ranges": ranges})

    assert response.status_code == 200
    assert response.json()["ranges"] == [ranges[1], ranges[0]]  # ordenadas por día
    assert client.get(URL).json()["configured"] is True


def test_guardar_reemplaza_los_horarios_anteriores(client, horarios):
    response = client.put(URL, json={"ranges": [{"day_of_week": LUNES, "opens_at": "09:00", "closes_at": "13:00"}]})

    assert response.json()["ranges"] == [{"day_of_week": LUNES, "opens_at": "09:00", "closes_at": "13:00"}]


def test_configuracion_invalida_responde_400_y_no_cambia_nada(client, horarios):
    response = client.put(
        URL,
        json={"ranges": [
            {"day_of_week": MARTES, "opens_at": "12:00", "closes_at": "16:00"},
            {"day_of_week": MARTES, "opens_at": "15:00", "closes_at": "18:00"},
        ]},
    )

    assert response.status_code == 400
    assert "se superpone" in response.json()["detail"]
    assert len(client.get(URL).json()["ranges"]) == len(HORARIOS)


@pytest.mark.parametrize("hora", ["24:00", "9:00", "12:60", "mediodía"])
def test_rechaza_horas_mal_formadas(client, hora):
    response = client.put(URL, json={"ranges": [{"day_of_week": MARTES, "opens_at": hora, "closes_at": "15:00"}]})

    assert response.status_code == 422


def test_configurar_horarios_requiere_ser_admin(public_client, customer_headers):
    ranges = [{"day_of_week": MARTES, "opens_at": "12:00", "closes_at": "15:00"}]

    assert public_client.put(URL, json={"ranges": ranges}).status_code == 401
    assert public_client.put(URL, json={"ranges": ranges}, headers=customer_headers).status_code == 403


# --- Pedidos web ----------------------------------------------------------------------------------


def _pedido_web(muzza):
    return {
        "customer_name": "Ana Gómez",
        "customer_phone": "11 5555-1234",
        "delivery_method": "retiro",
        "items": [{"product_id": muzza.id, "quantity": 1}],
    }


def test_no_acepta_pedidos_web_con_el_local_cerrado(public_client, db_session, muzza, horarios):
    with _fijar_ahora(_momento(LUNES, 21)):
        response = public_client.post(WEB_ORDERS_URL, json=_pedido_web(muzza))

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "El local está cerrado en este momento, así que no podemos tomar pedidos. "
        "Volvemos a abrir mañana a las 12:00."
    )
    assert db_session.query(Order).count() == 0


def test_acepta_pedidos_web_dentro_del_horario(public_client, db_session, muzza, horarios):
    with _fijar_ahora(_momento(SABADO, 1, 30)):  # la noche del viernes no pasa las 00, pero...
        cerrado = public_client.post(WEB_ORDERS_URL, json=_pedido_web(muzza))
    with _fijar_ahora(_momento(DOMINGO, 1, 30)):  # ...la del sábado sigue hasta las 02
        abierto = public_client.post(WEB_ORDERS_URL, json=_pedido_web(muzza))

    assert cerrado.status_code == 409
    assert abierto.status_code == 201
    assert db_session.query(Order).count() == 1


def test_los_pedidos_del_mostrador_no_se_restringen_por_horario(client, muzza, horarios):
    with _fijar_ahora(_momento(LUNES, 21)):
        response = client.post("/api/v1/orders/counter", json=_pedido_web(muzza))

    assert response.status_code == 201
