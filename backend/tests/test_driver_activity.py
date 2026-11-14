"""US-54: historial de viajes de un repartidor, con sus pedidos y el efectivo que debe rendir."""

from datetime import datetime, timedelta, timezone

from app.models.delivery_driver import DeliveryDriver, DeliveryTrip
from app.models.order import Order


def _driver(db_session, name="Nico"):
    driver = DeliveryDriver(name=name, phone="1144445555")
    db_session.add(driver)
    db_session.commit()
    return driver


def _trip(db_session, driver, dispatched_at=None):
    trip = DeliveryTrip(delivery_driver_id=driver.id)
    if dispatched_at:
        trip.dispatched_at = dispatched_at
    db_session.add(trip)
    db_session.commit()
    return trip


def _order(db_session, trip, driver, status="En Camino", payment="efectivo", total=1000.0, paid=False, stop=1, **extra):
    order = Order(
        customer_name=f"Cliente {stop}",
        shipping_address=f"Calle {stop}",
        total_amount=total,
        status=status,
        delivery_method="domicilio",
        payment_method=payment,
        is_paid=paid,
        delivery_driver_id=driver.id,
        trip_id=trip.id,
        trip_stop=stop,
        **extra,
    )
    db_session.add(order)
    db_session.commit()
    return order


def _activity(client, driver, **params):
    response = client.get(f"/api/v1/delivery-drivers/{driver.id}/trips", params=params)
    assert response.status_code == 200
    return response.json()


def test_viaje_en_curso_muestra_sus_paradas_y_no_tiene_hora_de_fin(client, db_session):
    driver = _driver(db_session)
    trip = _trip(db_session, driver)
    _order(db_session, trip, driver, stop=1)
    _order(db_session, trip, driver, stop=2, payment="mercadopago", paid=True)

    data = _activity(client, driver)

    assert data["trips_count"] == 1
    assert data["delivered_orders_count"] == 0
    assert data["cash_to_hand_over"] == 1000.0
    [summary] = data["trips"]
    assert summary["is_in_progress"] is True
    assert summary["finished_at"] is None
    assert summary["stops_count"] == 2
    assert [o["customer_name"] for o in summary["orders"]] == ["Cliente 1", "Cliente 2"]
    assert summary["orders"][0]["payment_method"] == "efectivo"
    assert summary["orders"][0]["shipping_address"] == "Calle 1"


def test_viaje_finalizado_informa_la_hora_de_fin_y_los_pedidos_entregados(client, db_session):
    driver = _driver(db_session)
    trip = _trip(db_session, driver)
    _order(db_session, trip, driver, status="Finalizado", stop=1, paid=True)
    _order(db_session, trip, driver, status="Finalizado", stop=2, paid=True)

    data = _activity(client, driver)

    assert data["trips"][0]["is_in_progress"] is False
    assert data["trips"][0]["finished_at"] is not None
    assert data["delivered_orders_count"] == 2


def test_efectivo_a_rendir_suma_los_pedidos_en_efectivo_sin_abonar(client, db_session):
    driver = _driver(db_session)
    trip = _trip(db_session, driver)
    _order(db_session, trip, driver, total=1500.0, stop=1)
    _order(db_session, trip, driver, total=700.0, stop=2)

    assert _activity(client, driver)["cash_to_hand_over"] == 2200.0


def test_marcar_abonado_registra_la_rendicion_y_deja_de_sumar(client, db_session, open_shift):
    driver = _driver(db_session)
    trip = _trip(db_session, driver)
    rendido = _order(db_session, trip, driver, total=1500.0, stop=1)
    _order(db_session, trip, driver, total=700.0, stop=2)

    client.patch(f"/api/v1/orders/{rendido.id}/payment", json={"is_paid": True})

    assert _activity(client, driver)["cash_to_hand_over"] == 700.0


def test_no_suma_lo_que_no_es_efectivo_ni_los_pedidos_cancelados(client, db_session):
    driver = _driver(db_session)
    trip = _trip(db_session, driver)
    _order(db_session, trip, driver, payment="mercadopago", stop=1)
    _order(db_session, trip, driver, status="Cancelado", stop=2)

    assert _activity(client, driver)["cash_to_hand_over"] == 0


def test_con_pago_parcial_solo_suma_la_diferencia_en_efectivo(client, db_session):
    driver = _driver(db_session)
    trip = _trip(db_session, driver)
    _order(
        db_session, trip, driver, payment="mercadopago", total=2000.0, stop=1,
        paid_amount=1200.0, balance_payment_method="efectivo",
    )

    assert _activity(client, driver)["cash_to_hand_over"] == 800.0


def test_filtra_por_periodo_y_ordena_del_mas_reciente_al_mas_antiguo(client, db_session):
    driver = _driver(db_session)
    now = datetime.now(timezone.utc)
    old = _trip(db_session, driver, now - timedelta(days=10))
    recent = _trip(db_session, driver, now - timedelta(hours=1))
    newest = _trip(db_session, driver, now)

    everything = _activity(client, driver)
    assert [t["id"] for t in everything["trips"]] == [newest.id, recent.id, old.id]

    last_week = _activity(client, driver, date_from=(now - timedelta(days=7)).isoformat())
    assert [t["id"] for t in last_week["trips"]] == [newest.id, recent.id]
    assert last_week["trips_count"] == 2


def test_no_incluye_viajes_de_otros_repartidores(client, db_session):
    driver, other = _driver(db_session), _driver(db_session, "Otro")
    _trip(db_session, other)

    assert _activity(client, driver)["trips"] == []


def test_turno_actual_solo_cuenta_los_viajes_desde_que_abrio_la_caja(client, db_session, open_shift):
    driver = _driver(db_session)
    shift_start = open_shift.opened_at.replace(tzinfo=timezone.utc)
    _trip(db_session, driver, shift_start - timedelta(hours=3))
    during = _trip(db_session, driver, shift_start + timedelta(minutes=5))

    data = _activity(client, driver, current_shift=True)

    assert [t["id"] for t in data["trips"]] == [during.id]


def test_turno_actual_sin_caja_abierta_no_devuelve_viajes(client, db_session):
    driver = _driver(db_session)
    _trip(db_session, driver)

    assert _activity(client, driver, current_shift=True)["trips"] == []


def test_repartidor_inexistente_devuelve_404(client):
    assert client.get("/api/v1/delivery-drivers/999/trips").status_code == 404
