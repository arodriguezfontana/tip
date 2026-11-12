import socket
import threading

import pytest

from app.models.order import Order

COUNTER_URL = "/api/v1/orders/counter"
PRINTERS_URL = "/api/v1/printers"


class FakePrinter:
    """Servidor TCP que hace de impresora de red: guarda lo que le mandan."""

    def __init__(self):
        self.server = socket.socket()
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(5)
        self.port = self.server.getsockname()[1]
        self.received: list[bytes] = []
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self):
        while True:
            try:
                conn, _ = self.server.accept()
            except OSError:
                return
            with conn:
                data = b""
                while chunk := conn.recv(4096):
                    data += chunk
                self.received.append(data)

    def close(self):
        self.server.close()


@pytest.fixture()
def fake_printer():
    printer = FakePrinter()
    yield printer
    printer.close()


@pytest.fixture()
def dead_port():
    """Puerto en el que no escucha nadie (impresora apagada)."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _configure(client, *entries):
    body = {"printers": [{"sector": s, "name": f"Imp {s}", "host": "127.0.0.1", "port": p} for s, p in entries]}
    response = client.put(PRINTERS_URL, json=body)
    assert response.status_code == 200, response.text
    return response


def _counter_payload(items, **overrides):
    payload = {
        "customer_name": "Paula",
        "customer_phone": "11 4444-5555",
        "delivery_method": "domicilio",
        "shipping_address": "Belgrano 95, Ramos Mejía",
        "notes": "Sin cebolla",
        "items": items,
        "payment_method": "efectivo",
    }
    payload.update(overrides)
    return payload


def _wait_for(printer, count=1):
    for _ in range(100):
        if len(printer.received) >= count:
            return
        threading.Event().wait(0.02)


def test_configuracion_de_impresoras_se_guarda_y_se_lee(client):
    _configure(client, ("cocina", 9100), ("barra", 9101))
    body = client.get(PRINTERS_URL).json()
    assert {p["sector"] for p in body} == {"cocina", "barra"}

    _configure(client, ("cocina", 9100))
    assert [p["sector"] for p in client.get(PRINTERS_URL).json()] == ["cocina"]


def test_rechaza_sector_repetido_o_invalido(client):
    dup = {"printers": [{"sector": "cocina", "name": "A", "host": "1.1.1.1"}] * 2}
    assert client.put(PRINTERS_URL, json=dup).status_code == 422
    bad = {"printers": [{"sector": "patio", "name": "A", "host": "1.1.1.1"}]}
    assert client.put(PRINTERS_URL, json=bad).status_code == 422


def test_pedido_de_mostrador_imprime_la_comanda_con_los_datos_obligatorios(client, products, open_shift, fake_printer):
    _configure(client, ("cocina", fake_printer.port))

    response = client.post(COUNTER_URL, json=_counter_payload([{"product_id": products["muzza"].id, "quantity": 2}]))

    assert response.status_code == 201
    body = response.json()
    assert body["print_error"] is None
    _wait_for(fake_printer)
    ticket = fake_printer.received[0].decode("cp858", "replace")
    for expected in (
        f"PEDIDO #{body['id']}",
        "Belgrano 95, Ramos Mej",
        "1144445555",
        "Sin cebolla",
        "DOMICILIO",
        "2 x Pizza Muzzarella",
        "TOTAL",
        "17.000,00",
        "Efectivo",
    ):
        assert expected in ticket


def test_si_la_impresora_no_responde_el_pedido_se_guarda_igual(client, db_session, products, open_shift, dead_port):
    _configure(client, ("cocina", dead_port))

    response = client.post(COUNTER_URL, json=_counter_payload([{"product_id": products["muzza"].id, "quantity": 1}]))

    assert response.status_code == 201
    body = response.json()
    assert body["print_error"]
    assert db_session.query(Order).filter(Order.id == body["id"]).one().status == "Confirmado"


def test_sin_impresoras_configuradas_se_informa_pero_no_bloquea(client, products, open_shift):
    response = client.post(COUNTER_URL, json=_counter_payload([{"product_id": products["muzza"].id, "quantity": 1}]))
    assert response.status_code == 201
    assert response.json()["print_error"]


def test_con_una_sola_impresora_se_usa_sin_importar_el_sector(client, products, open_shift, fake_printer):
    _configure(client, ("pizzeria", fake_printer.port))
    items = [{"product_id": products["coca"].id, "quantity": 1}]

    response = client.post(COUNTER_URL, json=_counter_payload(items))

    assert response.json()["print_error"] is None
    _wait_for(fake_printer)
    assert len(fake_printer.received) == 1


def test_pedido_de_varios_sectores_imprime_en_cada_impresora(client, db_session, products, open_shift):
    cocina, barra = FakePrinter(), FakePrinter()
    try:
        products["coca"].sector = "barra"
        products["muzza"].sector = "cocina"
        db_session.commit()
        _configure(client, ("cocina", cocina.port), ("barra", barra.port))
        items = [
            {"product_id": products["muzza"].id, "quantity": 1},
            {"product_id": products["coca"].id, "quantity": 1},
        ]

        response = client.post(COUNTER_URL, json=_counter_payload(items))

        assert response.json()["print_error"] is None
        _wait_for(cocina)
        _wait_for(barra)
        assert len(cocina.received) == 1 and len(barra.received) == 1
        assert b"SECTOR: COCINA" in cocina.received[0]
        assert b"SECTOR: BARRA" in barra.received[0]
    finally:
        cocina.close()
        barra.close()


def test_sector_sin_impresora_cuando_hay_varias_se_informa(client, db_session, products, open_shift, fake_printer):
    other = FakePrinter()
    try:
        products["coca"].sector = "barra"
        db_session.commit()
        _configure(client, ("cocina", fake_printer.port), ("pizzeria", other.port))

        response = client.post(
            COUNTER_URL, json=_counter_payload([{"product_id": products["coca"].id, "quantity": 1}])
        )

        assert "barra" in response.json()["print_error"]
    finally:
        other.close()


def test_reimprimir_comanda_manualmente(client, products, open_shift, fake_printer):
    _configure(client, ("cocina", fake_printer.port))
    order_id = client.post(
        COUNTER_URL, json=_counter_payload([{"product_id": products["muzza"].id, "quantity": 1}])
    ).json()["id"]
    _wait_for(fake_printer)

    response = client.post(f"/api/v1/orders/{order_id}/print")

    assert response.status_code == 200
    assert response.json()["success"] is True
    _wait_for(fake_printer, 2)
    assert len(fake_printer.received) == 2


def test_reimprimir_informa_el_error_de_la_impresora(client, products, open_shift, dead_port):
    _configure(client, ("cocina", dead_port))
    order_id = client.post(
        COUNTER_URL, json=_counter_payload([{"product_id": products["muzza"].id, "quantity": 1}])
    ).json()["id"]

    response = client.post(f"/api/v1/orders/{order_id}/print")

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["errors"]


def test_reimprimir_pedido_inexistente_da_404(client):
    assert client.post("/api/v1/orders/9999/print").status_code == 404


def test_aceptar_pedido_pendiente_imprime_la_comanda(client, db_session, products, fake_printer):
    _configure(client, ("cocina", fake_printer.port))
    order = Order(
        customer_name="Juan",
        shipping_address="Retiro en el local",
        total_amount=8500.0,
        status="Pendiente",
        delivery_method="retiro",
    )
    order.set_items([(products["muzza"], 1, None, None, [], None)])
    db_session.add(order)
    db_session.commit()
    assert not fake_printer.received

    response = client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "Confirmado", "estimated_minutes": 30})

    assert response.status_code == 200, response.text
    assert response.json()["print_error"] is None
    _wait_for(fake_printer)
    assert len(fake_printer.received) == 1


def test_pedido_web_imprime_la_comanda_sin_bloquear(client, products, fake_printer):
    _configure(client, ("cocina", fake_printer.port))
    response = client.post(
        "/api/v1/orders/web",
        json={
            "customer_name": "Juan",
            "customer_phone": "11 5555-6666",
            "delivery_method": "retiro",
            "items": [{"product_id": products["muzza"].id, "quantity": 1}],
        },
    )
    assert response.status_code == 201, response.text
    _wait_for(fake_printer)
    assert len(fake_printer.received) == 1


def test_pagina_de_prueba(client, fake_printer, dead_port):
    ok = client.post(f"{PRINTERS_URL}/test", json={"host": "127.0.0.1", "port": fake_printer.port})
    assert ok.json()["success"] is True
    fail = client.post(f"{PRINTERS_URL}/test", json={"host": "127.0.0.1", "port": dead_port})
    assert fail.json()["success"] is False


def test_endpoints_de_impresoras_exigen_admin(public_client):
    assert public_client.get(PRINTERS_URL).status_code in (401, 403)
    assert public_client.post("/api/v1/orders/1/print").status_code in (401, 403)


def test_el_numero_de_pedido_se_reinicia_con_cada_turno_de_caja(client, db_session, products, open_shift):
    from app.models.cash_shift import CashShift

    def new_order():
        items = [{"product_id": products["muzza"].id, "quantity": 1}]
        return client.post(COUNTER_URL, json=_counter_payload(items)).json()

    primero, segundo = new_order(), new_order()
    assert (primero["shift_number"], segundo["shift_number"]) == (1, 2)

    # Al cerrar el turno y abrir otro, la numeración vuelve a empezar en 1 (el id interno sigue creciendo).
    open_shift.status = "cerrada"
    db_session.add(CashShift(initial_amount=0, status="abierta"))
    db_session.commit()
    tercero = new_order()
    assert tercero["shift_number"] == 1
    assert tercero["id"] > segundo["id"]
    assert db_session.query(Order).filter(Order.id == primero["id"]).one().shift_number == 1
