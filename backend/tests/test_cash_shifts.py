import pytest

from app.core.errors import BusinessRuleError
from app.models.order import Order
from app.services import order_service

CASH_SHIFTS_URL = "/api/v1/cash-shifts"


def test_estado_inicial_sin_cajas_abiertas(client):
    response = client.get(f"{CASH_SHIFTS_URL}/current")
    assert response.status_code == 200
    data = response.json()
    assert data["is_open"] is False
    assert data["shift"] is None


def test_apertura_de_caja_exitosa(client):
    response = client.post(
        f"{CASH_SHIFTS_URL}/open",
        json={"initial_amount": 15000.50, "notes": "Fondo inicial billetes varios"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "abierta"
    assert data["initial_amount"] == 15000.50
    assert data["notes"] == "Fondo inicial billetes varios"
    assert data["closed_at"] is None
    assert data["final_amount"] is None


def test_rechaza_apertura_con_monto_negativo(client):
    response = client.post(
        f"{CASH_SHIFTS_URL}/open",
        json={"initial_amount": -100.0},
    )
    assert response.status_code == 422


def test_rechaza_abrir_segunda_caja_si_ya_hay_una_abierta(client):
    res1 = client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 10000.0})
    assert res1.status_code == 201

    res2 = client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 5000.0})
    assert res2.status_code == 400
    assert "ya hay una caja abierta" in res2.json()["detail"].lower()


def test_registro_de_movimientos_manuales_ingreso_y_egreso(client):
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 10000.0})

    # Registrar ingreso
    res_ingreso = client.post(
        f"{CASH_SHIFTS_URL}/movements",
        json={
            "type": "ingreso",
            "amount": 2500.0,
            "category": "Aporte de cambio",
            "description": "Cambio de billetes chicos",
        },
    )
    assert res_ingreso.status_code == 201
    ingreso_data = res_ingreso.json()
    assert ingreso_data["type"] == "ingreso"
    assert ingreso_data["amount"] == 2500.0
    assert ingreso_data["category"] == "Aporte de cambio"
    assert ingreso_data["description"] == "Cambio de billetes chicos"

    # Registrar egreso
    res_egreso = client.post(
        f"{CASH_SHIFTS_URL}/movements",
        json={
            "type": "egreso",
            "amount": 1200.0,
            "category": "Pago a proveedor",
            "description": "Compra de hielo de urgencia",
        },
    )
    assert res_egreso.status_code == 201
    egreso_data = res_egreso.json()
    assert egreso_data["type"] == "egreso"
    assert egreso_data["amount"] == 1200.0

    # Consultar estado actual
    res_current = client.get(f"{CASH_SHIFTS_URL}/current")
    assert res_current.status_code == 200
    curr_data = res_current.json()
    assert curr_data["is_open"] is True
    shift = curr_data["shift"]
    summary = shift["summary"]
    assert summary["manual_income"] == 2500.0
    assert summary["manual_expense"] == 1200.0
    # Teórica: 10000 + 2500 - 1200 = 11300
    assert summary["expected_cash"] == 11300.0
    assert len(shift["movements"]) == 2


def test_eliminar_movimiento_manual(client):
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 10000.0})
    res_mov = client.post(
        f"{CASH_SHIFTS_URL}/movements",
        json={"type": "ingreso", "amount": 500.0, "category": "Error de tipeo"},
    )
    mov_id = res_mov.json()["id"]

    del_res = client.delete(f"{CASH_SHIFTS_URL}/movements/{mov_id}")
    assert del_res.status_code == 204

    # Verificar que ya no impacta en la caja teórica
    res_current = client.get(f"{CASH_SHIFTS_URL}/current")
    assert res_current.json()["shift"]["summary"]["expected_cash"] == 10000.0
    assert len(res_current.json()["shift"]["movements"]) == 0


def test_calculo_caja_teorica_con_pedidos_efectivo_y_digitales(client, db_session, products):
    # Abrir caja con 8000
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 8000.0})

    # Pedido 1: Mostrador pagado en efectivo ($8500)
    res_p1 = client.post(
        "/api/v1/orders/counter",
        json={
            "customer_name": "Juan Efectivo",
            "customer_phone": "11 1111-2222",
            "delivery_method": "retiro",
            "shipping_address": None,
            "items": [{"product_id": products["muzza"].id, "quantity": 1}],
            "payment_method": "efectivo",
            "is_paid": True,
        },
    )
    assert res_p1.status_code == 201

    # Pedido 2: Mostrador pagado por transferencia ($2500)
    res_p2 = client.post(
        "/api/v1/orders/counter",
        json={
            "customer_name": "Ana Transferencia",
            "customer_phone": "11 3333-4444",
            "delivery_method": "retiro",
            "shipping_address": None,
            "items": [{"product_id": products["coca"].id, "quantity": 1}],
            "payment_method": "transferencia",
            "is_paid": True,
        },
    )
    assert res_p2.status_code == 201

    # Pedido 3: Mostrador pagado por mercadopago ($8500)
    res_p3 = client.post(
        "/api/v1/orders/counter",
        json={
            "customer_name": "Lucas MP",
            "customer_phone": "11 5555-6666",
            "delivery_method": "retiro",
            "shipping_address": None,
            "items": [{"product_id": products["muzza"].id, "quantity": 1}],
            "payment_method": "mercadopago",
            "is_paid": True,
        },
    )
    assert res_p3.status_code == 201

    # Movimiento manual: Egreso de $1000 (pago de flete)
    client.post(
        f"{CASH_SHIFTS_URL}/movements",
        json={"type": "egreso", "amount": 1000.0, "category": "Pago flete"},
    )

    # Verificar cálculo en tiempo real
    res_curr = client.get(f"{CASH_SHIFTS_URL}/current")
    summary = res_curr.json()["shift"]["summary"]

    assert summary["initial_amount"] == 8000.0
    assert summary["cash_sales"] == 8500.0
    assert summary["manual_expense"] == 1000.0
    assert summary["manual_income"] == 0.0

    # Caja Teórica = 8000 + 8500 - 1000 = 15500
    assert summary["expected_cash"] == 15500.0

    # Digitales: 2500 (transf) + 8500 (mp) = 11000
    assert summary["total_digital_sales"] == 11000.0
    assert summary["transferencia_sales"] == 2500.0
    assert summary["mercadopago_sales"] == 8500.0

    # Total ventas turno: 8500 (efectivo) + 11000 (digital) = 19500
    assert summary["total_sales"] == 19500.0
    assert summary["orders_count"] == 3


@pytest.mark.parametrize(
    "monto_real,tipo_esperado,diferencia_esperada",
    [
        (16000.0, "sobrante", 500.0),
        (15000.0, "faltante", -500.0),
        (15500.0, "exacta", 0.0),
    ],
)
def test_cierre_de_caja_con_sobrante_faltante_y_exacta(
    client, products, monto_real, tipo_esperado, diferencia_esperada
):
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 7000.0})

    # Pedido efectivo 8500 -> Teórica = 7000 + 8500 = 15500
    client.post(
        "/api/v1/orders/counter",
        json={
            "customer_name": "Cliente",
            "customer_phone": "11 1111-2222",
            "delivery_method": "retiro",
            "shipping_address": None,
            "items": [{"product_id": products["muzza"].id, "quantity": 1}],
            "payment_method": "efectivo",
            "is_paid": True,
        },
    )

    close_res = client.post(
        f"{CASH_SHIFTS_URL}/close",
        json={"final_amount": monto_real, "notes": f"Cierre con {tipo_esperado}"},
    )
    assert close_res.status_code == 200
    close_data = close_res.json()

    assert close_data["status"] == "cerrada"
    assert close_data["final_amount"] == monto_real
    assert close_data["expected_amount"] == 15500.0
    assert close_data["difference"] == diferencia_esperada
    assert close_data["difference_type"] == tipo_esperado
    assert close_data["closed_at"] is not None


def test_inmutabilidad_del_turno_cerrado(client, db_session, products):
    # Abrir caja
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 5000.0})

    # Crear pedido de mostrador
    res_order = client.post(
        "/api/v1/orders/counter",
        json={
            "customer_name": "Test Inmutable",
            "customer_phone": "11 9999-8888",
            "delivery_method": "retiro",
            "shipping_address": None,
            "items": [{"product_id": products["muzza"].id, "quantity": 1}],
            "payment_method": "efectivo",
            "is_paid": False,
        },
    )
    order_id = res_order.json()["id"]

    # Agregar un movimiento
    res_mov = client.post(
        f"{CASH_SHIFTS_URL}/movements",
        json={"type": "ingreso", "amount": 1000.0, "category": "Cambio"},
    )
    mov_id = res_mov.json()["id"]

    # Cerrar la caja
    client.post(f"{CASH_SHIFTS_URL}/close", json={"final_amount": 6000.0})

    # 1. No se pueden agregar productos al pedido
    order = db_session.get(Order, order_id)
    with pytest.raises(BusinessRuleError, match="turno de caja.*cerrado"):
        order.add_items([(products["coca"], 1)])

    # 2. No se pueden modificar pagos del pedido
    with pytest.raises(BusinessRuleError, match="turno de caja.*cerrado"):
        order_service.update_order_payment(db_session, order.id, is_paid=True)

    # 3. No se pueden cambiar transiciones de estado del pedido
    with pytest.raises(BusinessRuleError, match="turno de caja.*cerrado"):
        order.transition_to("En preparación", None, 30)

    # 4. No se pueden borrar movimientos de un turno cerrado
    del_mov = client.delete(f"{CASH_SHIFTS_URL}/movements/{mov_id}")
    assert del_mov.status_code == 400
    assert "cerrado" in del_mov.json()["detail"].lower()

    # 5. No se puede volver a cerrar una caja ya cerrada
    res_reclose = client.post(f"{CASH_SHIFTS_URL}/close", json={"final_amount": 5000.0})
    assert res_reclose.status_code == 400


def test_historial_y_detalle_de_turnos(client):
    # Turno 1
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 5000.0})
    res_close1 = client.post(f"{CASH_SHIFTS_URL}/close", json={"final_amount": 5000.0})
    shift1_id = res_close1.json()["id"]

    # Turno 2
    client.post(f"{CASH_SHIFTS_URL}/open", json={"initial_amount": 10000.0})
    res_close2 = client.post(f"{CASH_SHIFTS_URL}/close", json={"final_amount": 10200.0})
    shift2_id = res_close2.json()["id"]

    # Historial
    res_hist = client.get(f"{CASH_SHIFTS_URL}")
    assert res_hist.status_code == 200
    data = res_hist.json()
    items = data["items"]
    assert len(items) >= 2
    ids = [s["id"] for s in items]
    assert shift1_id in ids
    assert shift2_id in ids

    # Detalle individual
    res_det = client.get(f"{CASH_SHIFTS_URL}/{shift2_id}")
    assert res_det.status_code == 200
    det = res_det.json()
    assert det["id"] == shift2_id
    assert det["final_amount"] == 10200.0
    assert det["expected_amount"] == 10000.0
    assert det["difference"] == 200.0
    assert det["difference_type"] == "sobrante"
