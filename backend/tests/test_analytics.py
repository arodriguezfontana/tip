from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.config import settings
from app.models.menu import Category, Ingredient, Product, ProductIngredient
from app.models.order import Order, OrderItem

STATS_URL = "/api/v1/stats"


@pytest.fixture(autouse=True)
def _auth_stats_pin(client):
    client.headers["X-Admin-PIN"] = settings.ADMIN_PIN


LUNES_MEDIODIA = datetime(2026, 9, 28, 15, 0, tzinfo=timezone.utc)
MARTES_MEDIODIA = datetime(2026, 9, 29, 15, 0, tzinfo=timezone.utc)
MIERCOLES_MEDIODIA = datetime(2026, 9, 30, 15, 0, tzinfo=timezone.utc)


def _order(db_session, status="Finalizado", created_at=LUNES_MEDIODIA, items=(), total=None):
    order = Order(
        customer_name="Cliente Test",
        shipping_address="Retiro en el local",
        delivery_method="retiro",
        status=status,
        created_at=created_at,
        total_amount=Decimal(str(total)) if total is not None else sum(Decimal(str(p.price)) * q for p, q in items),
    )
    order.items = [OrderItem(product_id=p.id, quantity=q, unit_price=p.price) for p, q in items]
    db_session.add(order)
    db_session.commit()
    return order


def test_obtener_metas_por_defecto(client):
    resp = client.get(f"{STATS_URL}/goals")
    assert resp.status_code == 200
    data = resp.json()["goals"]
    period_types = {g["period_type"] for g in data}
    assert "monthly" in period_types
    assert "weekly" in period_types
    assert "daily" in period_types


def test_actualizar_metas_comerciales(client):
    payload = {
        "goals": [
            {"period_type": "monthly", "target_revenue": 6000000.0, "target_orders": 400},
            {"period_type": "weekly", "target_revenue": 1500000.0, "target_orders": 100},
            {"period_type": "daily", "target_revenue": 250000.0, "target_orders": 20},
        ]
    }
    put_resp = client.put(f"{STATS_URL}/goals", json=payload)
    assert put_resp.status_code == 200

    get_resp = client.get(f"{STATS_URL}/goals")
    by_type = {g["period_type"]: g for g in get_resp.json()["goals"]}
    assert by_type["monthly"]["target_revenue"] == 6000000.0
    assert by_type["monthly"]["target_orders"] == 400


def test_kpis_ticket_promedio_y_tasa_rechazo(client, db_session):
    # 2 pedidos finalizados por $10.000 cada uno ($20.000 total)
    _order(db_session, status="Finalizado", total=10000, created_at=LUNES_MEDIODIA)
    _order(db_session, status="Finalizado", total=10000, created_at=LUNES_MEDIODIA)
    # 1 pedido rechazado
    _order(db_session, status="Rechazado", total=5000, created_at=LUNES_MEDIODIA)
    # 1 pedido cancelado
    _order(db_session, status="Cancelado", total=3000, created_at=LUNES_MEDIODIA)

    resp = client.get(
        f"{STATS_URL}/kpis",
        params={"date_from": "2026-09-28T00:00:00Z", "date_to": "2026-09-28T23:59:59Z"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Facturación total: $20.000 (pedidos facturables)
    assert data["revenue"]["current"] == 20000.0
    # Pedidos finalizados: 2 -> Ticket promedio = 20000 / 2 = 10000.0
    assert data["completed_orders_count"] == 2
    assert data["average_ticket"]["current"] == 10000.0

    # Total pedidos ingresados: 4. Rechazados + Cancelados: 2 -> Tasa: 50%
    assert data["cancellation_rate"]["current"] == 50.0


def test_kpis_rentabilidad_bruta_y_costo_ingredientes(client, db_session):
    cat = Category(name="Pizzas Test")
    db_session.add(cat)
    db_session.flush()

    # Crear insumos con costo
    queso = Ingredient(name="Queso Barra Test", unit="kg", cost=Decimal("2000"), extra_price=Decimal("500"))
    harina = Ingredient(name="Harina Test", unit="kg", cost=Decimal("500"), extra_price=Decimal("0"))
    db_session.add_all([queso, harina])
    db_session.commit()

    # Crear pizza con receta: 0.3kg queso ($600) + 0.2kg harina ($100) = costo unitario $700
    pizza = Product(
        name="Pizza Especial Test",
        price=Decimal("5000"),
        category_id=cat.id,
        is_active=True,
    )
    pizza.recipe_items = [
        ProductIngredient(ingredient=queso, quantity=0.3),
        ProductIngredient(ingredient=harina, quantity=0.2),
    ]
    db_session.add(pizza)
    db_session.commit()

    # Vender 2 pizzas finalizadas: Ingresos $10.000, Costo insumos 2 * 700 = $1.400
    _order(db_session, status="Finalizado", items=[(pizza, 2)], created_at=MARTES_MEDIODIA)

    resp = client.get(
        f"{STATS_URL}/kpis",
        params={"date_from": "2026-09-29T00:00:00Z", "date_to": "2026-09-29T23:59:59Z"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["revenue"]["current"] == 10000.0
    assert data["cogs"]["current"] == 1400.0
    # Ganancia bruta = 10000 - 1400 = 8600.0
    assert data["gross_profit"]["current"] == 8600.0
    # Margen bruto = (8600 / 10000) * 100 = 86.0%
    assert data["gross_margin_pct"] == 86.0

    # Top productos debe incluir costo y margen
    prod_kpi = next((p for p in data["top_products"] if p["product_name"] == "Pizza Especial Test"), None)
    assert prod_kpi is not None
    assert prod_kpi["total_quantity"] == 2
    assert prod_kpi["total_revenue"] == 10000.0
    assert prod_kpi["estimated_cost"] == 1400.0
    assert prod_kpi["gross_profit"] == 8600.0
    assert prod_kpi["margin_pct"] == 86.0


def test_kpis_tendencias_growth_comparativa(client, db_session):
    # Período anterior (Lunes 28): facturación $10.000
    _order(db_session, status="Finalizado", total=10000, created_at=LUNES_MEDIODIA)
    # Período actual (Martes 29): facturación $15.000 (+50%)
    _order(db_session, status="Finalizado", total=15000, created_at=MARTES_MEDIODIA)

    # Rango actual: Martes 29 (1 día de duración) -> Período anterior equivalente: Lunes 28
    resp = client.get(
        f"{STATS_URL}/kpis",
        params={"date_from": "2026-09-29T00:00:00Z", "date_to": "2026-09-29T23:59:59Z"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["revenue"]["current"] == 15000.0
    assert data["revenue"]["previous"] == 10000.0
    assert data["revenue"]["growth_pct"] == 50.0
    assert data["revenue"]["trend"] == "up"
    assert data["revenue"]["is_positive"] is True


def test_asistente_insight_estrategico(client, db_session):
    _order(db_session, status="Finalizado", total=20000, created_at=MIERCOLES_MEDIODIA)

    resp = client.get(
        f"{STATS_URL}/strategic-insight",
        params={"date_from": "2026-09-30T00:00:00Z", "date_to": "2026-09-30T23:59:59Z"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "summary" in data and len(data["summary"]) > 0
    assert isinstance(data["highlights"], list) and len(data["highlights"]) > 0
    assert isinstance(data["recommendations"], list) and len(data["recommendations"]) == 6
    assert "operational_weaknesses" in data
    assert isinstance(data["operational_weaknesses"], list)
    assert "spending_recommendations" in data
    assert isinstance(data["spending_recommendations"], list) and len(data["spending_recommendations"]) > 0


def test_asistente_insight_tiempos_espera_y_flujos_operativos(client, db_session):
    # Pedido con demora elevada (55 min) a domicilio en horario específico (21:00 hs)
    hora_pico = datetime(2026, 9, 30, 21, 15, tzinfo=timezone.utc)
    order1 = _order(db_session, status="Finalizado", total=12000, created_at=hora_pico)
    order1.estimated_minutes = 55
    order1.delivery_method = "domicilio"

    order2 = _order(db_session, status="Rechazado", total=8000, created_at=hora_pico)
    order2.estimated_minutes = 45
    order2.delivery_method = "domicilio"

    db_session.commit()

    resp = client.get(
        f"{STATS_URL}/strategic-insight",
        params={"date_from": "2026-09-30T00:00:00Z", "date_to": "2026-09-30T23:59:59Z"},
    )
    assert resp.status_code == 200
    data = resp.json()

    op = data.get("operational_metrics")
    assert op is not None
    # 2 pedidos con demoras de 55 y 45 min -> Promedio = 50.0 min
    assert op["avg_wait_minutes"] == 50.0
    assert op["max_wait_minutes"] == 55
    assert op["high_wait_count"] == 2
    assert op["delivery_pct"] == 100.0
    assert op["peak_hour"] == 21

    # Detección de debilidades operativas claras y directas
    weaknesses = data["operational_weaknesses"]
    assert any("Demoras" in w or "demora" in w.lower() for w in weaknesses)
    assert any("hora pico" in w.lower() or "cuello de botella" in w.lower() for w in weaknesses)

    # Recomendaciones concretas de acción
    recs = data["recommendations"]
    assert len(recs) >= 2
    assert any("cocina" in r.lower() or "despacho" in r.lower() or "personal" in r.lower() for r in recs)


