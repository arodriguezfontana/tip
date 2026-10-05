from datetime import datetime, timezone

import pytest

from app.modules.order import Order, OrderItem

STATS_URL = "/api/v1/stats"

# 2026-09-28 es lunes.
LUNES_MEDIODIA = datetime(2026, 9, 28, 15, 0, tzinfo=timezone.utc)  # 12:00 en Argentina
MARTES_MEDIODIA = datetime(2026, 9, 29, 15, 0, tzinfo=timezone.utc)
SABADO_MEDIODIA = datetime(2026, 10, 3, 15, 0, tzinfo=timezone.utc)


def _order(db_session, status="Finalizado", created_at=LUNES_MEDIODIA, items=(), total=None):
    order = Order(
        customer_name="Cliente",
        shipping_address="Retiro en el local",
        delivery_method="retiro",
        status=status,
        created_at=created_at,
        total_amount=total if total is not None else sum(p.price * q for p, q in items),
    )
    order.items = [OrderItem(product_id=p.id, quantity=q, unit_price=p.price) for p, q in items]
    db_session.add(order)
    db_session.commit()
    return order


def test_distribucion_por_estado_cuenta_todos_los_pedidos(client, db_session):
    for status in ["Pendiente", "Pendiente", "Confirmado", "Finalizado", "Rechazado"]:
        _order(db_session, status=status, total=100)

    response = client.get(f"{STATS_URL}/status-distribution")

    assert response.status_code == 200
    assert response.json()["status_distribution"] == {
        "Pendiente": 2,
        "Confirmado": 1,
        "Finalizado": 1,
        "Rechazado": 1,
    }


def test_distribucion_respeta_el_rango_de_fechas(client, db_session):
    _order(db_session, status="Pendiente", created_at=LUNES_MEDIODIA, total=100)
    _order(db_session, status="Finalizado", created_at=SABADO_MEDIODIA, total=100)

    response = client.get(
        f"{STATS_URL}/status-distribution",
        params={"date_from": "2026-09-28T00:00:00Z", "date_to": "2026-09-30T00:00:00Z"},
    )

    assert response.json()["status_distribution"] == {"Pendiente": 1}


def test_distribucion_sin_pedidos_devuelve_vacio(client, db_session):
    assert client.get(f"{STATS_URL}/status-distribution").json() == {"status_distribution": {}}


def test_top_productos_ordena_por_cantidad_y_suma_ingresos(client, db_session, products):
    muzza, coca = products["muzza"], products["coca"]
    _order(db_session, items=[(muzza, 2), (coca, 1)])
    _order(db_session, items=[(coca, 4)])

    response = client.get(f"{STATS_URL}/top-products")

    assert response.status_code == 200
    assert response.json() == [
        {"product_name": "Coca-Cola 500ml", "total_quantity": 5, "total_revenue": 5 * 2500.0},
        {"product_name": "Pizza Muzzarella", "total_quantity": 2, "total_revenue": 2 * 8500.0},
    ]


def test_top_productos_no_cuenta_pedidos_rechazados(client, db_session, products):
    _order(db_session, status="Rechazado", items=[(products["coca"], 10)])
    _order(db_session, status="Finalizado", items=[(products["muzza"], 1)])

    nombres = [p["product_name"] for p in client.get(f"{STATS_URL}/top-products").json()]

    assert nombres == ["Pizza Muzzarella"]


def test_top_productos_respeta_el_limite(client, db_session, products):
    _order(db_session, items=[(products["muzza"], 3), (products["coca"], 1)])

    response = client.get(f"{STATS_URL}/top-products", params={"limit": 1})

    assert [p["product_name"] for p in response.json()] == ["Pizza Muzzarella"]


def test_top_productos_respeta_el_rango_de_fechas(client, db_session, products):
    _order(db_session, created_at=LUNES_MEDIODIA, items=[(products["muzza"], 1)])
    _order(db_session, created_at=SABADO_MEDIODIA, items=[(products["coca"], 1)])

    response = client.get(f"{STATS_URL}/top-products", params={"date_from": "2026-10-01T00:00:00Z"})

    assert [p["product_name"] for p in response.json()] == ["Coca-Cola 500ml"]


def test_dia_mas_rentable_suma_la_facturacion_por_dia_de_la_semana(client, db_session):
    _order(db_session, created_at=LUNES_MEDIODIA, total=1000)
    _order(db_session, created_at=MARTES_MEDIODIA, total=3000)
    _order(db_session, created_at=SABADO_MEDIODIA, total=2500)
    _order(db_session, created_at=SABADO_MEDIODIA, total=2500)

    response = client.get(f"{STATS_URL}/best-selling-day")

    assert response.status_code == 200
    assert response.json() == {"best_selling_day": "Sábado", "total_revenue": 5000.0}


def test_dia_mas_rentable_no_cuenta_pedidos_rechazados(client, db_session):
    _order(db_session, status="Rechazado", created_at=SABADO_MEDIODIA, total=99999)
    _order(db_session, status="Finalizado", created_at=LUNES_MEDIODIA, total=100)

    assert client.get(f"{STATS_URL}/best-selling-day").json()["best_selling_day"] == "Lunes"


@pytest.mark.parametrize(
    "created_at,dia_esperado",
    [
        # Lunes 22:30 en Argentina es martes 01:30 en UTC: debe contar como lunes.
        (datetime(2026, 9, 29, 1, 30, tzinfo=timezone.utc), "Lunes"),
        # Martes 00:30 en Argentina (martes 03:30 UTC).
        (datetime(2026, 9, 29, 3, 30, tzinfo=timezone.utc), "Martes"),
    ],
)
def test_dia_mas_rentable_usa_la_hora_del_local(client, db_session, created_at, dia_esperado):
    _order(db_session, created_at=created_at, total=100)

    assert client.get(f"{STATS_URL}/best-selling-day").json()["best_selling_day"] == dia_esperado


def test_dia_mas_rentable_sin_ventas(client, db_session):
    assert client.get(f"{STATS_URL}/best-selling-day").json() == {"best_selling_day": None, "total_revenue": None}
