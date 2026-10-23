import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.models.order import MAX_QUANTITY_PER_ITEM, Order
from app.services.chat_memory import INACTIVIDAD_PARA_REINICIAR, SesionChat
from app.services.chat_service import MAX_ACTIVE_SESSIONS, ChatService
from app.services.tools.order_tools import (
    MAX_ITEMS_EN_PEDIDO,
    MAX_LARGO_CLIENTE,
    MAX_LARGO_DIRECCION,
    calcular_y_preparar_pedido,
    confirmar_y_guardar_pedido,
)
from tests.conftest import TestingSessionLocal


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal):
        yield


def _calcular_raw(**args) -> str:
    return calcular_y_preparar_pedido.invoke(args)


def _calcular(**args) -> dict:
    return json.loads(_calcular_raw(**args))


def _confirmar(datos: dict, chat_id: str | None = None) -> str:
    args = {"datos_pedido_json": json.dumps(datos)}
    if chat_id is not None:
        args["telegram_chat_id"] = chat_id
    return confirmar_y_guardar_pedido.invoke(args)


# --- Tests de Seguridad: Tools y Sanitización de Entradas ---


def test_calcular_y_preparar_pedido_rechaza_cantidades_negativas_o_cero(products):
    """Verifica que el bot no acepte cantidades <= 0 para evitar subtotales negativos o pedidos vacíos."""
    # Caso 1: Todos los ítems tienen cantidad inválida (retorna mensaje aclaratorio)
    items_json = json.dumps([
        {"nombre": "Pizza Muzzarella", "cantidad": 0},
        {"nombre": "Coca-Cola 500ml", "cantidad": -3},
    ])
    raw_res = _calcular_raw(
        items_solicitados=items_json,
        customer_name="Juan",
        customer_phone="1144445555",
        delivery_method="retiro",
    )
    assert "la cantidad debe ser de al menos 1 unidad" in raw_res
    assert "Necesito que revises algunos productos del pedido" in raw_res

    # Caso 2: Un ítem válido y otro con cantidad inválida (retorna JSON pero marca faltan_datos)
    items_mixtos = json.dumps([
        {"nombre": "Pizza Muzzarella", "cantidad": 1},
        {"nombre": "Coca-Cola 500ml", "cantidad": 0},
    ])
    res = _calcular(
        items_solicitados=items_mixtos,
        customer_name="Juan",
        customer_phone="1144445555",
        delivery_method="retiro",
        metodo_pago="efectivo",
    )
    assert res["datos_temporales"]["faltan_datos"] is True
    assert "la cantidad debe ser de al menos 1 unidad" in res["mensaje_para_usuario"]
    assert "corregir las cantidades no válidas" in res["mensaje_para_usuario"]
    # Solo el producto válido entra al subtotal
    assert len(res["datos_temporales"]["items"]) == 1
    assert res["datos_temporales"]["total"] == 8500.0


def test_calcular_y_preparar_pedido_rechaza_cantidades_excesivas(products):
    """Verifica que no se permitan cantidades por ítem mayores a MAX_QUANTITY_PER_ITEM."""
    cant_invalida = MAX_QUANTITY_PER_ITEM + 1
    items_json = json.dumps([
        {"nombre": "Pizza Muzzarella", "cantidad": cant_invalida},
    ])
    raw_res = _calcular_raw(
        items_solicitados=items_json,
        customer_name="Juan",
        customer_phone="1144445555",
        delivery_method="retiro",
    )
    assert f"supera la cantidad máxima permitida ({MAX_QUANTITY_PER_ITEM} unidades)" in raw_res

    # Caso mixto: 1 válido y 1 que excede
    items_mixtos = json.dumps([
        {"nombre": "Coca-Cola 500ml", "cantidad": 2},
        {"nombre": "Pizza Muzzarella", "cantidad": cant_invalida},
    ])
    res = _calcular(
        items_solicitados=items_mixtos,
        customer_name="Juan",
        customer_phone="1144445555",
        delivery_method="retiro",
        metodo_pago="efectivo",
    )
    assert res["datos_temporales"]["faltan_datos"] is True
    assert f"supera la cantidad máxima permitida ({MAX_QUANTITY_PER_ITEM} unidades)" in res["mensaje_para_usuario"]
    assert len(res["datos_temporales"]["items"]) == 1
    assert res["datos_temporales"]["total"] == 5000.0


def test_calcular_y_preparar_pedido_limita_cantidad_de_items_por_pedido(products):
    """Verifica que una lista masiva de ítems sea truncada a MAX_ITEMS_EN_PEDIDO para evitar DoS."""
    muchos_items = [{"nombre": "Coca-Cola 500ml", "cantidad": 1} for _ in range(MAX_ITEMS_EN_PEDIDO + 20)]
    res = _calcular(
        items_solicitados=json.dumps(muchos_items),
        customer_name="Carlos",
        customer_phone="1144445555",
        delivery_method="retiro",
    )

    assert len(res["datos_temporales"]["items"]) <= MAX_ITEMS_EN_PEDIDO


def test_calcular_y_preparar_pedido_trunca_campos_de_texto_largos(products):
    """Verifica que nombres y direcciones extremadamente largos sean truncados sin error."""
    nombre_gigante = "A" * (MAX_LARGO_CLIENTE + 50)
    direccion_gigante = "B" * (MAX_LARGO_DIRECCION + 50)

    res = _calcular(
        items_solicitados="1 Pizza Muzzarella",
        customer_name=nombre_gigante,
        customer_phone="1144445555",
        delivery_method="domicilio",
        shipping_address=direccion_gigante,
    )

    assert len(res["datos_temporales"]["cliente"]) <= MAX_LARGO_CLIENTE
    assert len(res["datos_temporales"]["direccion"]) <= MAX_LARGO_DIRECCION


def test_confirmar_y_guardar_pedido_trunca_campos_y_persiste_correctamente(db_session, products):
    """Verifica que al confirmar se trunquen los textos largos antes de persistir en base de datos."""
    nombre_largo = "C" * (MAX_LARGO_CLIENTE + 50)
    direccion_larga = "D" * (MAX_LARGO_DIRECCION + 50)

    datos = {
        "items": [{"product_id": products["muzza"].id, "quantity": 1, "unit_price": 8500.0}],
        "total": 8500.0,
        "cliente": nombre_largo,
        "telefono": "11 4444-5555",
        "direccion": direccion_larga,
        "metodo_entrega": "domicilio",
        "metodo_pago": "efectivo",
    }

    mensaje = _confirmar(datos)
    assert "confirmado" in mensaje.lower()

    orden = db_session.query(Order).order_by(Order.id.desc()).first()
    assert orden is not None
    assert len(orden.customer_name) <= MAX_LARGO_CLIENTE
    assert orden.customer_name == nombre_largo[:MAX_LARGO_CLIENTE]
    assert len(orden.shipping_address) <= MAX_LARGO_DIRECCION
    assert orden.shipping_address == direccion_larga[:MAX_LARGO_DIRECCION]


# --- Tests de Seguridad: System Prompt del Bot ---


def test_chat_service_system_prompt_contiene_reglas_de_seguridad():
    """Verifica que el system prompt contenga las reglas esenciales contra prompt injection y desvíos de rol."""
    with patch("app.services.chat_service.ChatGoogleGenerativeAI"):
        chat_service = ChatService()
        prompt = chat_service.system_prompt

        assert "REGLAS DE SEGURIDAD Y PROTECCIÓN" in prompt
        assert "INTEGRIDAD DEL ROL" in prompt
        assert "PRECIOS Y PROMOCIONES OFICIALES" in prompt
        assert "CONFIDENCIALIDAD" in prompt
        assert "CONFIRMACIÓN ESTRICTA" in prompt


# --- Tests de Seguridad: Control de Memoria y Sesiones Inactivas ---


def test_chat_service_limpia_sesiones_inactivas_cuando_supera_limite():
    """Verifica que si la cantidad de sesiones supera MAX_ACTIVE_SESSIONS, las inactivas se liberen para mitigar agotamiento de RAM."""
    with patch("app.services.chat_service.ChatGoogleGenerativeAI"):
        chat_service = ChatService()

        ahora = datetime.now(timezone.utc)
        tiempo_viejo = ahora - INACTIVIDAD_PARA_REINICIAR - timedelta(minutes=10)

        # Creamos sesiones viejas (inactivas)
        for i in range(MAX_ACTIVE_SESSIONS + 10):
            sesion = SesionChat()
            sesion.ultima_actividad = tiempo_viejo
            chat_service.sesiones[f"session_{i}"] = sesion

        # Una sesión reciente activa
        sesion_activa = SesionChat()
        sesion_activa.ultima_actividad = ahora
        chat_service.sesiones["session_activa"] = sesion_activa

        assert len(chat_service.sesiones) > MAX_ACTIVE_SESSIONS

        # Ejecutamos la limpieza
        chat_service._limpiar_sesiones_inactivas()

        # Las inactivas fueron depuradas, la activa se mantiene
        assert "session_activa" in chat_service.sesiones
        assert len(chat_service.sesiones) == 1

