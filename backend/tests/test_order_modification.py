"""US-37: el cliente cambia el medio de pago o suma productos a un pedido que acaba de registrar."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.order import (
    InvalidOrderError,
    ModificationWindowClosedError,
    Order,
    OrderNotModifiableError,
    PaymentChangeNotAllowedError,
)
from app.services import order_service
from app.services.mercadopago_service import process_payment_notification
from app.services.order_service import OrderRequest
from app.services.tools.order_edit_tools import agregar_items_al_pedido, cambiar_metodo_de_pago
from tests.conftest import TestingSessionLocal

CHAT = "5491155551234"


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_edit_tools.SessionLocal", TestingSessionLocal):
        yield


def _pedido(db, products, payment_method="efectivo", paid=False, canal="whatsapp", chat_id=CHAT) -> Order:
    """Pedido del bot con una muzza ($8.500) y una Coca ($2.500) registrado recién."""
    request = OrderRequest(
        customer_name="Carlitos",
        customer_phone="11 4444-5555",
        delivery_method="domicilio",
        shipping_address="Condarco 1145",
        notes=None,
        items=[(products["muzza"].id, 1), (products["coca"].id, 1)],
    )
    order = order_service.create_bot_order(db, request, canal, chat_id, None, payment_method)
    if paid:
        order.is_paid = True
        db.commit()
    return order


def _agregar(items: str, canal="whatsapp", chat_id=CHAT) -> str:
    return agregar_items_al_pedido.invoke({"items_solicitados": items, "canal": canal, "chat_id": chat_id})


def _cambiar_pago(metodo: str, canal="whatsapp", chat_id=CHAT) -> str:
    return cambiar_metodo_de_pago.invoke({"metodo_pago": metodo, "canal": canal, "chat_id": chat_id})


def _hace_minutos(db, order, minutos: int) -> None:
    order.created_at = datetime.now(timezone.utc) - timedelta(minutes=minutos)
    db.commit()


# --- Regla del pedido (modelo) ---


def test_agregar_suma_a_la_misma_comanda_y_recalcula_el_total(db_session, products):
    order = _pedido(db_session, products)

    costo = order_service.add_items_to_order(db_session, order, [(products["coca"].id, 2)])

    assert costo == Decimal("5000.00")
    assert order.total_amount == Decimal("16000.00")  # 8.500 + 2.500 + 5.000
    assert db_session.query(Order).count() == 1
    nuevos = [i for i in order.items if i.added_later]
    assert [(i.product_id, i.quantity) for i in nuevos] == [(products["coca"].id, 2)]
    assert order.kitchen_update_pending is True


def test_pasados_los_10_minutos_ya_no_se_puede_agregar(db_session, products):
    order = _pedido(db_session, products)
    _hace_minutos(db_session, order, 11)

    with pytest.raises(ModificationWindowClosedError):
        order_service.add_items_to_order(db_session, order, [(products["coca"].id, 1)])

    assert len(order.items) == 2
    assert order.total_amount == Decimal("11000.00")


def test_a_los_9_minutos_todavia_se_puede(db_session, products):
    order = _pedido(db_session, products)
    _hace_minutos(db_session, order, 9)

    order_service.add_items_to_order(db_session, order, [(products["coca"].id, 1)])

    assert order.total_amount == Decimal("13500.00")


@pytest.mark.parametrize("estado", ["En Camino", "Listo para Retirar", "Finalizado", "Cancelado"])
def test_un_pedido_que_ya_salio_no_se_modifica(db_session, products, estado):
    order = _pedido(db_session, products)
    order.status = estado
    db_session.commit()

    with pytest.raises(OrderNotModifiableError):
        order_service.add_items_to_order(db_session, order, [(products["coca"].id, 1)])
    with pytest.raises(OrderNotModifiableError):
        order_service.change_order_payment_method(db_session, order, "mercadopago")


def test_no_se_agregan_productos_agotados_ni_se_supera_el_maximo(db_session, products):
    order = _pedido(db_session, products)

    with pytest.raises(InvalidOrderError):
        order_service.add_items_to_order(db_session, order, [(products["agotada"].id, 1)])
    with pytest.raises(InvalidOrderError):
        order_service.add_items_to_order(db_session, order, [(products["coca"].id, 20)])  # ya había 1: 21 > 20

    assert order.total_amount == Decimal("11000.00")


def test_agregar_a_un_pedido_pagado_deja_un_pago_parcial(db_session, products):
    order = _pedido(db_session, products, payment_method="mercadopago", paid=True)

    order_service.add_items_to_order(db_session, order, [(products["coca"].id, 1)])

    assert order.is_paid is False
    assert order.has_partial_payment
    assert (order.amount_paid, order.amount_pending) == (Decimal("11000.00"), Decimal("2500.00"))
    assert order.total_amount == Decimal("13500.00")


def test_cambiar_el_pago_no_toca_a_cocina_ni_los_productos(db_session, products):
    order = _pedido(db_session, products, payment_method="mercadopago")

    order_service.change_order_payment_method(db_session, order, "efectivo")

    assert order.payment_method == "efectivo"
    assert order.kitchen_update_pending is False
    assert not any(i.added_later for i in order.items)
    assert db_session.query(Order).count() == 1


def test_un_pedido_abonado_no_cambia_de_medio_de_pago(db_session, products):
    order = _pedido(db_session, products, payment_method="mercadopago", paid=True)

    with pytest.raises(PaymentChangeNotAllowedError):
        order_service.change_order_payment_method(db_session, order, "efectivo")


# --- Herramientas del bot ---


def test_tool_agregar_a_pedido_no_pagado_informa_el_nuevo_total(db_session, products):
    _pedido(db_session, products, payment_method="efectivo")

    respuesta = _agregar("1 Coca-Cola")

    assert "¡Agregado!" in respuesta
    assert "Nuevo total: $13,500.00" in respuesta
    assert "efectivo al recibirlo" in respuesta
    [order] = db_session.query(Order).all()
    assert order.total_amount == Decimal("13500.00")


def test_tool_agregar_a_pedido_de_mercadopago_sin_pagar_genera_un_link_por_el_total_nuevo(db_session, products):
    _pedido(db_session, products, payment_method="mercadopago")

    respuesta = _agregar("1 Coca-Cola")

    assert "Nuevo total: $13,500.00" in respuesta
    assert "https://" in respuesta and "nuevo" in respuesta.lower()
    db_session.expire_all()
    assert db_session.query(Order).one().mp_preference_id


def test_tool_agregar_a_pedido_pagado_informa_la_diferencia_y_ofrece_opciones(db_session, products):
    _pedido(db_session, products, payment_method="mercadopago", paid=True)

    respuesta = _agregar("1 Coca-Cola")

    assert "Como ya habías pagado tu pedido anterior, te queda una diferencia de $2,500.00" in respuesta
    assert "¿Querés pagarla en efectivo cuando llegue el pedido o te mando un link de MercadoPago" in respuesta


def test_tool_pasados_los_10_minutos_rechaza_con_el_telefono_del_local(db_session, products):
    order = _pedido(db_session, products)
    _hace_minutos(db_session, order, 15)

    respuesta = _agregar("1 Coca-Cola")

    assert respuesta == (
        "Tu pedido ya está en preparación. Para agregar algo más, por favor llamá directo al local al 11 4444-5555."
    )
    db_session.expire_all()
    assert len(db_session.query(Order).one().items) == 2


def test_tool_con_productos_ambiguos_o_inexistentes_no_agrega_nada(db_session, products):
    _pedido(db_session, products)

    respuesta = _agregar("1 Lasagna inexistente")

    assert "No se pudieron reconocer" in respuesta
    assert db_session.query(Order).one().total_amount == Decimal("11000.00")


def test_tool_sin_pedido_previo_o_sin_canal(db_session, products):
    assert "No encuentro un pedido tuyo" in _agregar("1 Coca-Cola")
    assert "Por este medio no puedo" in _agregar("1 Coca-Cola", canal=None)


def test_tool_modifica_solo_el_pedido_de_ese_chat(db_session, products):
    otro = _pedido(db_session, products, chat_id="5491100000000")
    mio = _pedido(db_session, products)

    _agregar("1 Coca-Cola")

    db_session.expire_all()
    assert db_session.get(Order, mio.id).total_amount == Decimal("13500.00")
    assert db_session.get(Order, otro.id).total_amount == Decimal("11000.00")


def test_tool_cambiar_a_efectivo_actualiza_el_pago_del_mismo_pedido(db_session, products):
    _pedido(db_session, products, payment_method="mercadopago")

    respuesta = _cambiar_pago("al final te pago en efectivo")

    assert "efectivo" in respuesta and "$11,000.00" in respuesta
    db_session.expire_all()
    order = db_session.query(Order).one()
    assert order.payment_method == "efectivo"
    assert order.kitchen_update_pending is False


def test_tool_cambiar_a_mercadopago_manda_el_link(db_session, products):
    _pedido(db_session, products, payment_method="efectivo")

    respuesta = _cambiar_pago("mercadopago")

    assert "https://" in respuesta and "$11,000.00" in respuesta
    db_session.expire_all()
    order = db_session.query(Order).one()
    assert order.payment_method == "mercadopago" and order.mp_preference_id


def test_tool_cambiar_pago_de_un_pedido_ya_abonado(db_session, products):
    _pedido(db_session, products, payment_method="mercadopago", paid=True)

    assert "ya está abonado" in _cambiar_pago("efectivo")


def test_tool_cambiar_pago_con_pedido_en_camino(db_session, products):
    order = _pedido(db_session, products)
    order.status = "En Camino"
    db_session.commit()

    assert "ya salió" in _cambiar_pago("mercadopago")


def test_tool_metodo_de_pago_que_no_entiende(db_session, products):
    _pedido(db_session, products)

    assert "No entendí" in _cambiar_pago("con bitcoin")


# --- Saldar la diferencia de un pedido ya abonado ---


def test_la_diferencia_en_efectivo_queda_como_pago_mixto(db_session, products):
    _pedido(db_session, products, payment_method="mercadopago", paid=True)
    _agregar("1 Coca-Cola")

    respuesta = _cambiar_pago("efectivo")

    assert "la diferencia ($2,500.00) en efectivo" in respuesta
    db_session.expire_all()
    order = db_session.query(Order).one()
    assert order.payment_method == "mercadopago"  # lo ya pagado no cambia
    assert order.balance_payment_method == "efectivo"
    assert (order.amount_paid, order.amount_pending) == (Decimal("11000.00"), Decimal("2500.00"))


def test_la_diferencia_por_mercadopago_genera_un_link_solo_por_ese_monto(db_session, products):
    _pedido(db_session, products, payment_method="mercadopago", paid=True)
    _agregar("1 Coca-Cola")

    respuesta = _cambiar_pago("mercadopago")

    assert "por la diferencia ($2,500.00)" in respuesta and "https://" in respuesta
    db_session.expire_all()
    order = db_session.query(Order).one()
    assert order.balance_payment_method == "mercadopago"
    assert order.mp_preference_id == f"mp-pref-{order.id}-extra"


def test_el_pago_de_la_diferencia_salda_el_pedido_pero_el_aviso_del_primer_pago_no(db_session, products):
    order = _pedido(db_session, products, payment_method="mercadopago", paid=True)
    _agregar("1 Coca-Cola")
    _cambiar_pago("mercadopago")
    db_session.expire_all()

    # Llega de nuevo el aviso del primer pago (referencia "<id>"): no debe dar por saldado el pedido.
    process_payment_notification(db_session, payload={"status": "approved", "external_reference": str(order.id)})
    db_session.expire_all()
    assert db_session.get(Order, order.id).is_paid is False

    # El pago de la diferencia (referencia "<id>-extra") sí.
    process_payment_notification(
        db_session, payload={"status": "approved", "external_reference": f"{order.id}-extra", "data": {"id": "999"}}
    )
    db_session.expire_all()
    pagado = db_session.get(Order, order.id)
    assert pagado.is_paid is True
    assert (pagado.amount_paid, pagado.amount_pending) == (Decimal("13500.00"), Decimal("0.00"))


# --- API del panel ---


def test_el_panel_ve_el_pago_mixto_y_la_alerta_de_cocina(client, db_session, products):
    _pedido(db_session, products, payment_method="mercadopago", paid=True)
    _agregar("1 Coca-Cola")
    _cambiar_pago("efectivo")
    db_session.expire_all()

    [order] = client.get("/api/v1/orders").json()

    assert order["total_amount"] == 13500.0
    assert (order["paid_amount"], order["pending_amount"]) == (11000.0, 2500.0)
    assert (order["payment_method"], order["balance_payment_method"]) == ("mercadopago", "efectivo")
    assert order["kitchen_update_pending"] is True
    assert sorted(i["added_later"] for i in order["items"]) == [False, False, True]


def test_cocina_apaga_la_alerta_al_verla(client, db_session, products):
    order = _pedido(db_session, products)
    _agregar("1 Coca-Cola")
    db_session.expire_all()  # la herramienta del bot usa su propia sesión, como el resto de los pedidos de la API

    respuesta = client.post(f"/api/v1/orders/{order.id}/kitchen-update/ack")

    assert respuesta.status_code == 200
    assert respuesta.json()["kitchen_update_pending"] is False


def test_el_producto_agregado_aparece_en_la_misma_comanda_sin_pedido_nuevo(client, db_session, products):
    _pedido(db_session, products)
    _agregar("2 Coca-Cola")

    pedidos = client.get("/api/v1/orders").json()

    assert len(pedidos) == 1
    assert pedidos[0]["item_count"] == 3  # muzza, coca y la coca agregada


# --- Punta a punta por el chat ---


def test_el_chat_agrega_al_pedido_y_responde_sin_otra_llamada_al_modelo(db_session, products):
    import asyncio

    from langchain_core.messages import AIMessage

    from app.services.chat_service import ChatService

    class LLM:
        def __init__(self):
            self.llamadas = 0

        def bind_tools(self, _herramientas):
            return self

        async def ainvoke(self, _mensajes):
            self.llamadas += 1
            return AIMessage(
                content="",
                tool_calls=[{"name": "agregar_items_al_pedido", "args": {"items_solicitados": "1 Coca-Cola"}, "id": "c1"}],
            )

    _pedido(db_session, products, payment_method="mercadopago", paid=True)
    llm = LLM()

    respuesta = asyncio.run(
        ChatService(llm=llm).obtener_respuesta("agregame una coca", session_id=f"whatsapp:{CHAT}")
    )

    assert llm.llamadas == 1
    assert "te queda una diferencia de $2,500.00" in respuesta
    assert db_session.query(Order).count() == 1
