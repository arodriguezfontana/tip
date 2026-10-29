"""Gestión de Exclusiones y Extras (NLP).

- El motor NLP debe clasificar correctamente los modificadores positivos ("con", "extra", "agregale") y negativos ("sin", "quitale", "no le pongas").
- Los modificadores positivos que tengan costo adicional asociado deben sumar su valor al total del pedido automáticamente.
- Los modificadores negativos no alteran el precio, pero evitan el descuento del ingrediente en el módulo de inventario.
- La comanda para la cocina debe resaltar las modificaciones en mayúsculas o negritas debajo del ítem principal (ej. [SIN CEBOLLA], [EXTRA QUESO]).
"""

import json
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.menu import Category, Ingredient, Product, ProductIngredient
from app.models.order import Order, OrderItem, OrderStatus
from app.repositories import ingredient_repository
from app.services.modifier_nlp import (
    clasificar_modificador,
    extraer_modificadores_de_texto,
    formatear_comanda_modificaciones,
)
from app.services.tools.order_tools import calcular_y_preparar_pedido, confirmar_y_guardar_pedido
from tests.conftest import TestingSessionLocal

# --- Fixtures -----------------------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def tools_session(db_session):
    with patch("app.services.tools.order_tools.SessionLocal", TestingSessionLocal):
        yield


@pytest.fixture
def categoria(db_session):
    cat = Category(name="Minutas", sector="cocina")
    db_session.add(cat)
    db_session.flush()
    return cat


@pytest.fixture
def ingredientes(db_session):
    cebolla = Ingredient(name="Cebolla", unit="gramos", extra_price=0)
    tomate = Ingredient(name="Tomate", unit="gramos", extra_price=0)
    mayonesa = Ingredient(name="Mayonesa", unit="gramos", extra_price=0)
    queso = Ingredient(name="Queso", unit="gramos", extra_price=1000)
    panceta = Ingredient(name="Panceta", unit="gramos", extra_price=1500)
    db_session.add_all([cebolla, tomate, mayonesa, queso, panceta])
    db_session.flush()
    return {
        "cebolla": cebolla,
        "tomate": tomate,
        "mayonesa": mayonesa,
        "queso": queso,
        "panceta": panceta,
    }


@pytest.fixture
def hamburguesa(db_session, categoria, ingredientes):
    prod = Product(
        name="Hamburguesa Completa",
        price=Decimal("10000.00"),
        is_active=True,
        category_id=categoria.id,
    )
    db_session.add(prod)
    db_session.flush()
    # Receta con Cebolla (50g) y Tomate (50g)
    db_session.add(ProductIngredient(product_id=prod.id, ingredient_id=ingredientes["cebolla"].id, quantity=50))
    db_session.add(ProductIngredient(product_id=prod.id, ingredient_id=ingredientes["tomate"].id, quantity=50))
    db_session.commit()
    return prod


# --- 1. Clasificación NLP de modificadores positivos y negativos ---------------------------------------


def test_clasificacion_modificadores_positivos_y_negativos():
    # Modificadores positivos
    for trig in ("con", "extra", "agregale", "ponele", "sumale", "con extra"):
        m = clasificar_modificador(trig, "queso")
        assert m["type"] == "positive"
        assert m["action"] == "add"
        assert m["tag"] == "[EXTRA QUESO]"
        assert m["name"] == "queso"

    # Modificadores negativos
    for trig in ("sin", "quitale", "no le pongas", "sacale"):
        m = clasificar_modificador(trig, "cebolla")
        assert m["type"] == "negative"
        assert m["action"] == "remove"
        assert m["tag"] == "[SIN CEBOLLA]"
        assert m["name"] == "cebolla"


def test_extraer_modificadores_lenguaje_natural_complejo():
    texto = "1 Hamburguesa Completa sin cebolla y con extra queso"
    base, mods = extraer_modificadores_de_texto(texto)
    assert "Hamburguesa Completa" in base
    assert len(mods) == 2
    assert mods[0]["type"] == "negative"
    assert mods[0]["name"] == "cebolla"
    assert mods[0]["tag"] == "[SIN CEBOLLA]"
    assert mods[1]["type"] == "positive"
    assert mods[1]["name"] == "queso"
    assert mods[1]["tag"] == "[EXTRA QUESO]"


def test_extraer_modificadores_con_varios_triggers():
    texto = "Pizza agregale jamon y sacale aceitunas no le pongas oregano"
    base, mods = extraer_modificadores_de_texto(texto)
    assert base == "Pizza"
    assert len(mods) == 3
    assert mods[0]["type"] == "positive"
    assert mods[0]["name"] == "jamon"
    assert mods[1]["type"] == "negative"
    assert mods[1]["name"] == "aceitunas"
    assert mods[2]["type"] == "negative"
    assert mods[2]["name"] == "oregano"


def test_extraer_modificadores_formato_corchetes():
    texto = "Hamburguesa Completa [SIN CEBOLLA] [EXTRA PANCETA]"
    base, mods = extraer_modificadores_de_texto(texto)
    assert base == "Hamburguesa Completa"
    assert len(mods) == 2
    assert mods[0]["tag"] == "[SIN CEBOLLA]"
    assert mods[1]["tag"] == "[EXTRA PANCETA]"


# --- 2. Costo adicional de extras y precio inalterado de negativos -------------------------------------


def test_modificador_positivo_con_costo_suma_al_total(db_session, hamburguesa, ingredientes):
    # Queso tiene extra_price=1000
    texto_pedido = "1 Hamburguesa Completa con extra queso"
    res = json.loads(calcular_y_preparar_pedido.invoke({"items_solicitados": texto_pedido}))
    datos = res["datos_temporales"]

    # Base $10.000 + $1.000 de queso = $11.000
    assert datos["total"] == 11000.0
    item = datos["items"][0]
    assert item["unit_price"] == 11000.0
    assert len(item["modifications"]) == 1
    assert item["modifications"][0]["type"] == "positive"
    assert item["modifications"][0]["price"] == 1000.0


def test_modificador_negativo_no_altera_el_precio(db_session, hamburguesa, ingredientes):
    # Quitar cebolla no debe alterar el precio
    texto_pedido = "1 Hamburguesa Completa sin cebolla"
    res = json.loads(calcular_y_preparar_pedido.invoke({"items_solicitados": texto_pedido}))
    datos = res["datos_temporales"]

    # Base permanece $10.000
    assert datos["total"] == 10000.0
    item = datos["items"][0]
    assert item["unit_price"] == 10000.0
    assert len(item["modifications"]) == 1
    assert item["modifications"][0]["type"] == "negative"
    assert item["modifications"][0]["price"] == 0.0


def test_combinacion_positivo_con_costo_y_negativo_calcula_total_correcto(db_session, hamburguesa, ingredientes):
    # Base 10.000 + extra queso 1.000 + extra panceta 1.500, sin cebolla 0
    texto_pedido = "2 Hamburguesa Completa sin cebolla con extra queso y ponele panceta"
    res = json.loads(calcular_y_preparar_pedido.invoke({"items_solicitados": texto_pedido}))
    datos = res["datos_temporales"]

    # Unitario = 10.000 + 1.000 + 1.500 = 12.500
    # Total (x2) = 25.000
    assert datos["total"] == 25000.0
    item = datos["items"][0]
    assert item["unit_price"] == 12500.0
    assert len(item["modifications"]) == 3


# --- 3. Modificadores negativos evitan descuento en inventario ----------------------------------------


def test_modificador_negativo_evita_descuento_en_modulo_inventario(db_session, hamburguesa, ingredientes):
    # Crear dos pedidos finalizados:
    # 1. Hamburguesa normal (consume 50g cebolla, 50g tomate)
    order1 = Order(
        customer_name="Cliente 1",
        shipping_address="Local",
        total_amount=Decimal("10000"),
        status=OrderStatus.COMPLETED.value,
        delivery_method="retiro",
    )
    db_session.add(order1)
    db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order1.id,
            product_id=hamburguesa.id,
            quantity=1,
            unit_price=Decimal("10000"),
            modifications=[],
        )
    )

    # 2. Hamburguesa SIN cebolla (consume 0g cebolla, 50g tomate)
    order2 = Order(
        customer_name="Cliente 2",
        shipping_address="Local",
        total_amount=Decimal("10000"),
        status=OrderStatus.COMPLETED.value,
        delivery_method="retiro",
    )
    db_session.add(order2)
    db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order2.id,
            product_id=hamburguesa.id,
            quantity=1,
            unit_price=Decimal("10000"),
            modifications=[{"type": "negative", "name": "Cebolla", "ingredient_id": ingredientes["cebolla"].id, "tag": "[SIN CEBOLLA]"}],
        )
    )
    db_session.commit()

    # Calcular consumo en inventario
    consumo = ingredient_repository.consumption(db_session, None, None, None)
    consumo_dict = {name: total for _, name, _, total in consumo}

    # Cebolla: solo del pedido 1 (50g), el pedido 2 evitó el consumo por el modificador negativo
    assert consumo_dict["Cebolla"] == 50.0
    # Tomate: consumido en ambos pedidos (50g + 50g = 100g)
    assert consumo_dict["Tomate"] == 100.0


# --- 4. Comanda para cocina resalta modificaciones en mayúsculas -------------------------------------


def test_comanda_resalta_modificaciones_en_mayusculas(db_session, hamburguesa):
    mods = [
        {"type": "negative", "name": "cebolla", "tag": "[SIN CEBOLLA]"},
        {"type": "positive", "name": "queso", "tag": "[EXTRA QUESO]"},
    ]
    texto_comanda = formatear_comanda_modificaciones(mods)
    assert texto_comanda == "[SIN CEBOLLA] [EXTRA QUESO]"

    item = OrderItem(
        order_id=1,
        product_id=hamburguesa.id,
        product=hamburguesa,
        quantity=1,
        unit_price=Decimal("11000"),
        modifications=mods,
    )
    assert item.comanda_display == "Hamburguesa Completa [SIN CEBOLLA] [EXTRA QUESO]"


# --- 5. Flujo completo bot: cálculo y confirmación ---------------------------------------------------


def test_flujo_completo_bot_con_modificadores(db_session, hamburguesa, ingredientes):
    # 1. Calcular pedido con lenguaje natural
    calc_res = json.loads(calcular_y_preparar_pedido.invoke({
        "items_solicitados": "1 Hamburguesa Completa sin cebolla y con extra queso",
        "customer_name": "Juan Perez",
        "customer_phone": "1144556677",
        "metodo_entrega": "retiro",
    }))

    assert "[SIN CEBOLLA]" in calc_res["mensaje_para_usuario"]
    assert "[EXTRA QUESO]" in calc_res["mensaje_para_usuario"]

    datos_json = json.dumps(calc_res["datos_temporales"])

    # 2. Confirmar y guardar pedido
    conf_res = confirmar_y_guardar_pedido.invoke({"datos_pedido_json": datos_json})
    assert "Recibimos tu pedido" in conf_res

    # 3. Verificar persistencia de modificaciones en la base
    db_session.expire_all()
    orden = db_session.query(Order).filter(Order.customer_name == "Juan Perez").first()
    assert orden is not None
    assert len(orden.items) == 1
    db_item = orden.items[0]
    assert db_item.unit_price == Decimal("11000.00")
    assert len(db_item.modifications) == 2
    assert db_item.comanda_display == "Hamburguesa Completa [SIN CEBOLLA] [EXTRA QUESO]"
