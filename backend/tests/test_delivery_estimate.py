"""US-47: métricas de tiempos de los pedidos y estimación inteligente de la demora."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.order import Order, OrderStatusEvent
from app.services import order_service
from app.services.delivery_time_service import (
    MAX_PLAUSIBLE_MINUTES,
    MIN_SAMPLES_FOR_SMART_ESTIMATE,
    estimate_delay,
)
from app.services.order_service import OrderRequest


def _create_order(
    db_session, status="Pendiente", delivery_method="domicilio", scheduled_for=None, created_at=None, actual_minutes=None
):
    order = Order(
        customer_name="Juan Perez",
        shipping_address="Av. Siempreviva 742",
        total_amount=1000.0,
        status=status,
        delivery_method=delivery_method,
        scheduled_for=scheduled_for,
        created_at=created_at,
        actual_minutes=actual_minutes,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def _eventos(db_session, order_id):
    rows = (
        db_session.query(OrderStatusEvent)
        .filter(OrderStatusEvent.order_id == order_id)
        .order_by(OrderStatusEvent.id)
        .all()
    )
    return [(e.status, e.queue_size) for e in rows]


def _historial(db_session, cantidad, minutos, queue_size=0, delivery_method="domicilio", status="Finalizado"):
    """Pedidos ya finalizados con una demora real de `minutos`, aceptados con `queue_size` pedidos en cola."""
    for _ in range(cantidad):
        order = _create_order(db_session, status=status, delivery_method=delivery_method, actual_minutes=minutos)
        db_session.add(
            OrderStatusEvent(
                order_id=order.id, status="Confirmado", occurred_at=datetime.now(timezone.utc), queue_size=queue_size
            )
        )
    db_session.commit()


# --- Registro de métricas ---


def test_cada_cambio_de_estado_queda_registrado_con_la_cola_del_momento(client, db_session):
    _create_order(db_session, status="Confirmado")
    _create_order(db_session, status="Confirmado")
    order = _create_order(db_session)

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 20})
    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "En Camino"})
    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Finalizado"})

    # La cola es la de los otros pedidos aceptados (sin contarlo a él): eran 2 en todo el recorrido.
    assert _eventos(db_session, order.id) == [("Pendiente", 2), ("Confirmado", 2), ("En Camino", 2), ("Finalizado", 2)]


def test_los_eventos_guardan_el_momento_exacto(client, db_session):
    order = _create_order(db_session)
    antes = datetime.now(timezone.utc) - timedelta(seconds=5)

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})

    evento = db_session.query(OrderStatusEvent).filter_by(order_id=order.id, status="Rechazado").one()
    ocurrido = evento.occurred_at if evento.occurred_at.tzinfo else evento.occurred_at.replace(tzinfo=timezone.utc)
    assert antes <= ocurrido <= datetime.now(timezone.utc) + timedelta(seconds=5)


def test_al_finalizar_se_guarda_la_demora_real_desde_que_ingreso(client, db_session):
    ingreso = datetime.now(timezone.utc) - timedelta(minutes=50)
    order = _create_order(db_session, created_at=ingreso)

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 20})
    db_session.refresh(order)
    assert order.actual_minutes is None

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "En Camino"})
    respuesta = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Finalizado"})

    # Cuenta desde que el pedido ingresó (no desde que se confirmó) y no tiene que ver con los 20 minutos estimados.
    assert respuesta.json()["actual_minutes"] == 50
    db_session.refresh(order)
    assert order.actual_minutes == 50


def test_un_pedido_para_retirar_tambien_guarda_su_demora_real_al_finalizar(client, db_session):
    order = _create_order(
        db_session, delivery_method="retiro", created_at=datetime.now(timezone.utc) - timedelta(minutes=25)
    )

    for paso in ({"status": "Confirmado", "estimated_minutes": 10}, {"status": "Listo para Retirar"}):
        client.patch(f"/api/v1/orders/{order.id}/status", json=paso)
    db_session.refresh(order)
    assert order.actual_minutes is None

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Finalizado"})
    db_session.refresh(order)
    assert order.actual_minutes == 25


def test_un_pedido_cancelado_no_tiene_demora_real(client, db_session):
    order = _create_order(db_session)

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Rechazado"})
    db_session.refresh(order)

    assert order.actual_minutes is None


def test_un_cambio_que_no_es_de_estado_no_registra_evento(client, db_session):
    order = _create_order(db_session, status="Confirmado")

    client.post(f"/api/v1/orders/{order.id}/kitchen-update/ack")

    assert _eventos(db_session, order.id) == [("Confirmado", 0)]


# --- Modo inteligente / manual ---


def test_sin_historial_suficiente_el_empleado_tiene_que_indicar_la_demora(client, db_session):
    _historial(db_session, MIN_SAMPLES_FOR_SMART_ESTIMATE - 1, 40)
    order = _create_order(db_session)

    estimate = client.get(f"/api/v1/orders/{order.id}/estimate").json()
    assert estimate["mode"] == "manual"
    assert estimate["estimated_minutes"] is None
    assert (estimate["samples"], estimate["min_samples"]) == (MIN_SAMPLES_FOR_SMART_ESTIMATE - 1, 30)
    assert estimate["suggested_minutes"] == 15

    rechazo = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado"})
    assert rechazo.status_code == 400


def test_con_historial_suficiente_la_demora_se_calcula_sola(client, db_session):
    _historial(db_session, MIN_SAMPLES_FOR_SMART_ESTIMATE, 40)
    order = _create_order(db_session)

    estimate = client.get(f"/api/v1/orders/{order.id}/estimate").json()
    assert (estimate["mode"], estimate["estimated_minutes"], estimate["samples"]) == ("smart", 40, 30)

    respuesta = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado"})

    assert respuesta.status_code == 200
    assert respuesta.json()["estimated_minutes"] == 40
    assert respuesta.json()["estimate_source"] == "smart"


def test_promedia_los_tiempos_del_historial(db_session):
    _historial(db_session, 20, 30)
    _historial(db_session, 10, 60)

    estimate = estimate_delay(db_session, "domicilio", queue_size=0)

    assert (estimate.is_smart, estimate.minutes) == (True, 40)


def test_solo_cuentan_los_pedidos_aceptados_con_la_misma_carga(db_session):
    _historial(db_session, 20, 40, queue_size=0)
    _historial(db_session, 20, 40, queue_size=3)

    assert not estimate_delay(db_session, "domicilio", queue_size=0).is_smart
    assert not estimate_delay(db_session, "domicilio", queue_size=3).is_smart
    _historial(db_session, 10, 50, queue_size=3)
    assert estimate_delay(db_session, "domicilio", queue_size=3).is_smart
    assert not estimate_delay(db_session, "domicilio", queue_size=1).is_smart


def test_el_retiro_y_el_envio_tienen_historiales_separados(db_session):
    _historial(db_session, 30, 25, delivery_method="retiro")

    assert estimate_delay(db_session, "retiro", queue_size=0).minutes == 25
    assert not estimate_delay(db_session, "domicilio", queue_size=0).is_smart


def test_solo_cuentan_los_pedidos_finalizados(db_session):
    _historial(db_session, 30, 25, delivery_method="domicilio", status="En Camino")
    _historial(db_session, 30, 25, delivery_method="retiro", status="Listo para Retirar")

    assert not estimate_delay(db_session, "domicilio", queue_size=0).is_smart
    assert not estimate_delay(db_session, "retiro", queue_size=0).is_smart


def test_la_demora_estimada_de_los_pedidos_no_se_usa_para_calcular(db_session):
    # Pedidos con demora manual de 10 minutos que en la realidad tardaron 40: manda lo real.
    for _ in range(MIN_SAMPLES_FOR_SMART_ESTIMATE):
        order = _create_order(db_session, status="Finalizado", actual_minutes=40)
        order.estimated_minutes = 10
        order.estimate_source = "manual"
        db_session.add(
            OrderStatusEvent(order_id=order.id, status="Confirmado", occurred_at=datetime.now(timezone.utc), queue_size=0)
        )
    db_session.commit()

    assert estimate_delay(db_session, "domicilio", queue_size=0).minutes == 40


def test_un_pedido_sin_demora_real_no_cuenta(db_session):
    _historial(db_session, 30, 40)
    sin_dato = _create_order(db_session, status="Finalizado")
    db_session.add(
        OrderStatusEvent(order_id=sin_dato.id, status="Confirmado", occurred_at=datetime.now(timezone.utc), queue_size=0)
    )
    db_session.commit()

    estimate = estimate_delay(db_session, "domicilio", queue_size=0)

    assert (estimate.minutes, estimate.samples) == (40, 30)


def test_descarta_los_tiempos_imposibles(db_session):
    _historial(db_session, 25, 30)
    _historial(db_session, 5, MAX_PLAUSIBLE_MINUTES + 1)

    assert not estimate_delay(db_session, "domicilio", queue_size=0).is_smart


def test_los_pedidos_programados_no_cuentan_ni_se_estiman(client, db_session):
    programado = datetime.now(timezone.utc) + timedelta(hours=3)
    for _ in range(30):
        order = _create_order(db_session, status="Finalizado", scheduled_for=programado, actual_minutes=10)
        db_session.add(OrderStatusEvent(order_id=order.id, status="Confirmado", occurred_at=programado, queue_size=0))
    db_session.commit()
    assert not estimate_delay(db_session, "domicilio", queue_size=0).is_smart

    nuevo = _create_order(db_session, scheduled_for=programado)
    respuesta = client.patch(f"/api/v1/orders/{nuevo.id}/status", json={"status": "Confirmado"})
    assert respuesta.status_code == 200
    assert respuesta.json()["estimated_minutes"] is None


def test_una_demora_manual_se_guarda_como_manual(client, db_session):
    order = _create_order(db_session)

    respuesta = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 45})

    assert (respuesta.json()["estimated_minutes"], respuesta.json()["estimate_source"]) == (45, "manual")


# --- Transición automática ---


def test_los_pedidos_con_demora_manual_alimentan_el_historial_con_su_demora_real(client, db_session):
    def atender():
        # Se le puso una demora manual de 25 minutos, pero entre que ingresó y se finalizó pasaron 30.
        order = _create_order(db_session, created_at=datetime.now(timezone.utc) - timedelta(minutes=30))
        pasos = [{"status": "Confirmado", "estimated_minutes": 25}, {"status": "En Camino"}, {"status": "Finalizado"}]
        for paso in pasos:
            assert client.patch(f"/api/v1/orders/{order.id}/status", json=paso).status_code == 200

    nuevo = _create_order(db_session)
    assert client.get(f"/api/v1/orders/{nuevo.id}/estimate").json()["mode"] == "manual"

    for _ in range(MIN_SAMPLES_FOR_SMART_ESTIMATE):
        atender()

    estimate = client.get(f"/api/v1/orders/{nuevo.id}/estimate").json()
    # Pasa a automática con la demora real (30), no con la manual que se había cargado (25).
    assert (estimate["mode"], estimate["estimated_minutes"]) == ("smart", 30)
    respuesta = client.patch(f"/api/v1/orders/{nuevo.id}/status", json={"status": "Confirmado"})
    assert (respuesta.json()["estimated_minutes"], respuesta.json()["estimate_source"]) == (30, "smart")


# --- Pedidos que entran ya aceptados (web y mostrador) ---


@pytest.mark.parametrize("cantidad,fuente,minutos", [(0, "default", 15), (30, "smart", 33)])
def test_los_pedidos_que_entran_aceptados_usan_el_historial_o_la_demora_estandar(
    db_session, products, monkeypatch, cantidad, fuente, minutos
):
    _historial(db_session, cantidad, 33)
    request = OrderRequest(
        customer_name="Ana",
        customer_phone="1155551234",
        delivery_method="domicilio",
        shipping_address="Calle 1",
        notes=None,
        items=[(products["muzza"].id, 1)],
    )
    monkeypatch.setattr(order_service, "verificar_local_abierto", lambda db: None)

    order = order_service.create_web_order(db_session, request)

    assert (order.estimated_minutes, order.estimate_source) == (minutos, fuente)
