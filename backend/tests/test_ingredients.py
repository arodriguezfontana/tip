"""Ingredientes, recetas de los productos y reporte de consumo de ingredientes."""

from datetime import datetime, timezone

import pytest

from app.models.menu import Ingredient, ProductIngredient
from app.models.order import Order, OrderItem

INGREDIENTS_URL = "/api/v1/ingredients"
PRODUCTS_URL = "/api/v1/products"
CONSUMPTION_URL = "/api/v1/stats/ingredient-consumption"


@pytest.fixture()
def ingredients(db_session):
    muzzarella = Ingredient(name="Muzzarella", unit="gramos")
    salsa = Ingredient(name="Salsa de tomate", unit="gramos")
    huevo = Ingredient(name="Huevo", unit="unidades")
    db_session.add_all([muzzarella, salsa, huevo])
    db_session.commit()
    return {"muzzarella": muzzarella, "salsa": salsa, "huevo": huevo}


@pytest.fixture()
def recipe(db_session, products, ingredients):
    """La muzza lleva 250 g de muzzarella y 100 g de salsa; la Coca no tiene receta."""
    db_session.add_all([
        ProductIngredient(product_id=products["muzza"].id, ingredient_id=ingredients["muzzarella"].id, quantity=250),
        ProductIngredient(product_id=products["muzza"].id, ingredient_id=ingredients["salsa"].id, quantity=100),
    ])
    db_session.commit()


def _order(db_session, items, status="Finalizado", created_at=datetime(2026, 10, 5, 15, tzinfo=timezone.utc)):
    order = Order(customer_name="X", shipping_address="Y", total_amount=1.0, status=status, created_at=created_at)
    order.items = [OrderItem(product_id=product.id, quantity=qty, unit_price=product.price) for product, qty in items]
    db_session.add(order)
    db_session.commit()
    return order


# --- Lista maestra de ingredientes ------------------------------------------------------------------


def test_lista_ingredientes_ordenados_con_la_cantidad_de_productos_que_los_usan(client, recipe):
    response = client.get(INGREDIENTS_URL)

    assert response.status_code == 200
    assert [(i["name"], i["unit"], i["products_count"]) for i in response.json()] == [
        ("Huevo", "unidades", 0),
        ("Muzzarella", "gramos", 1),
        ("Salsa de tomate", "gramos", 1),
    ]


def test_crea_un_ingrediente(client, db_session):
    response = client.post(INGREDIENTS_URL, json={"name": "  Harina 000 ", "unit": "gramos"})

    assert response.status_code == 201
    assert response.json() == {"id": response.json()["id"], "name": "Harina 000", "unit": "gramos", "products_count": 0}
    assert db_session.query(Ingredient).one().name == "Harina 000"


def test_no_permite_ingredientes_con_el_mismo_nombre(client, ingredients):
    response = client.post(INGREDIENTS_URL, json={"name": "muzzarella", "unit": "kilos"})

    assert response.status_code == 409
    assert "Ya existe un ingrediente llamado 'muzzarella'" in response.json()["detail"]


@pytest.mark.parametrize("payload", [{"name": "", "unit": "gramos"}, {"name": "Harina", "unit": " "}, {"name": "Harina"}])
def test_valida_nombre_y_unidad(client, payload):
    assert client.post(INGREDIENTS_URL, json=payload).status_code == 422


def test_edita_un_ingrediente(client, ingredients, recipe):
    ingredient_id = ingredients["muzzarella"].id

    response = client.put(f"{INGREDIENTS_URL}/{ingredient_id}", json={"name": "Muzzarella en barra", "unit": "kilos"})

    assert response.status_code == 200
    assert response.json() == {"id": ingredient_id, "name": "Muzzarella en barra", "unit": "kilos", "products_count": 1}


def test_editar_con_el_nombre_de_otro_ingrediente_falla(client, ingredients):
    response = client.put(f"{INGREDIENTS_URL}/{ingredients['huevo'].id}", json={"name": "Muzzarella", "unit": "gramos"})

    assert response.status_code == 409


def test_editar_o_eliminar_un_ingrediente_inexistente_responde_404(client):
    assert client.put(f"{INGREDIENTS_URL}/999", json={"name": "X", "unit": "g"}).status_code == 404
    assert client.delete(f"{INGREDIENTS_URL}/999").status_code == 404


def test_elimina_un_ingrediente_sin_uso(client, db_session, ingredients):
    response = client.delete(f"{INGREDIENTS_URL}/{ingredients['huevo'].id}")

    assert response.status_code == 204
    assert {i.name for i in db_session.query(Ingredient)} == {"Muzzarella", "Salsa de tomate"}


def test_no_elimina_un_ingrediente_que_esta_en_una_receta(client, db_session, ingredients, recipe):
    response = client.delete(f"{INGREDIENTS_URL}/{ingredients['muzzarella'].id}")

    assert response.status_code == 409
    assert "forma parte de la receta de: Pizza Muzzarella" in response.json()["detail"]
    assert db_session.query(ProductIngredient).count() == 2


def test_ingredientes_y_recetas_son_solo_para_administradores(public_client, customer_headers):
    for method, url in [
        ("get", INGREDIENTS_URL),
        ("post", INGREDIENTS_URL),
        ("get", PRODUCTS_URL),
        ("put", f"{PRODUCTS_URL}/1/recipe"),
        ("get", CONSUMPTION_URL),
    ]:
        assert getattr(public_client, method)(url).status_code == 401
        assert getattr(public_client, method)(url, headers=customer_headers).status_code == 403


# --- Recetas ------------------------------------------------------------------------------------------


def test_lista_todos_los_productos_con_su_receta(client, recipe):
    body = {p["name"]: p for p in client.get(PRODUCTS_URL).json()}

    assert set(body) == {"Pizza Muzzarella", "Coca-Cola 500ml", "Pizza Agotada"}
    assert body["Pizza Agotada"]["is_active"] is False
    assert body["Coca-Cola 500ml"]["recipe"] == []
    assert [(r["ingredient_name"], r["unit"], r["quantity"]) for r in body["Pizza Muzzarella"]["recipe"]] == [
        ("Muzzarella", "gramos", 250),
        ("Salsa de tomate", "gramos", 100),
    ]


def test_reemplaza_la_receta_de_un_producto(client, db_session, products, ingredients, recipe):
    response = client.put(
        f"{PRODUCTS_URL}/{products['muzza'].id}/recipe",
        json={"items": [
            {"ingredient_id": ingredients["muzzarella"].id, "quantity": 300},  # cambia la cantidad
            {"ingredient_id": ingredients["huevo"].id, "quantity": 0.5},  # se agrega
        ]},  # la salsa se quita
    )

    assert response.status_code == 200
    assert [(r["ingredient_name"], r["quantity"]) for r in response.json()["recipe"]] == [
        ("Huevo", 0.5),
        ("Muzzarella", 300),
    ]
    assert {(i.ingredient_id, i.quantity) for i in db_session.query(ProductIngredient)} == {
        (ingredients["muzzarella"].id, 300),
        (ingredients["huevo"].id, 0.5),
    }


def test_una_receta_vacia_quita_todos_los_ingredientes(client, db_session, products, recipe):
    response = client.put(f"{PRODUCTS_URL}/{products['muzza'].id}/recipe", json={"items": []})

    assert response.json()["recipe"] == []
    assert db_session.query(ProductIngredient).count() == 0


def test_receta_con_ingrediente_repetido_o_inexistente_se_rechaza(client, db_session, products, ingredients, recipe):
    url = f"{PRODUCTS_URL}/{products['muzza'].id}/recipe"
    repetido = {"items": [{"ingredient_id": ingredients["huevo"].id, "quantity": 1}] * 2}
    inexistente = {"items": [{"ingredient_id": 999, "quantity": 1}]}

    assert client.put(url, json=repetido).json()["detail"] == "Un ingrediente figura más de una vez en la receta."
    assert client.put(url, json=inexistente).status_code == 400
    assert db_session.query(ProductIngredient).count() == 2


@pytest.mark.parametrize("quantity", [0, -5, 1_000_000])
def test_receta_con_cantidad_invalida_se_rechaza(client, products, ingredients, quantity):
    response = client.put(
        f"{PRODUCTS_URL}/{products['muzza'].id}/recipe",
        json={"items": [{"ingredient_id": ingredients["huevo"].id, "quantity": quantity}]},
    )

    assert response.status_code == 422


def test_receta_de_producto_inexistente_responde_404(client):
    assert client.put(f"{PRODUCTS_URL}/999/recipe", json={"items": []}).status_code == 404


# --- Consumo ------------------------------------------------------------------------------------------


def test_consumo_de_los_pedidos_finalizados(client, db_session, products, recipe):
    muzza, coca = products["muzza"], products["coca"]
    _order(db_session, [(muzza, 2), (coca, 1)])
    _order(db_session, [(muzza, 1)])
    for status in ("Pendiente", "Confirmado", "En Camino", "Listo para Retirar", "Rechazado"):
        _order(db_session, [(muzza, 10)], status=status)

    body = client.get(CONSUMPTION_URL).json()

    assert body["completed_orders"] == 2
    assert body["items"] == [
        {"ingredient_id": body["items"][0]["ingredient_id"], "ingredient_name": "Muzzarella", "unit": "gramos", "total_quantity": 750},
        {"ingredient_id": body["items"][1]["ingredient_id"], "ingredient_name": "Salsa de tomate", "unit": "gramos", "total_quantity": 300},
    ]
    assert body["products_without_recipe"] == ["Coca-Cola 500ml"]


def test_consumo_filtrado_por_fechas(client, db_session, products, recipe):
    muzza = products["muzza"]
    _order(db_session, [(muzza, 1)], created_at=datetime(2026, 10, 1, 15, tzinfo=timezone.utc))
    _order(db_session, [(muzza, 3)], created_at=datetime(2026, 10, 8, 15, tzinfo=timezone.utc))

    body = client.get(
        CONSUMPTION_URL,
        params={"date_from": "2026-10-05T00:00:00Z", "date_to": "2026-10-10T23:59:59Z"},
    ).json()

    assert body["completed_orders"] == 1
    assert {i["ingredient_name"]: i["total_quantity"] for i in body["items"]} == {"Muzzarella": 750, "Salsa de tomate": 300}


def test_consumo_filtrado_por_ingrediente(client, db_session, products, ingredients, recipe):
    _order(db_session, [(products["muzza"], 2)])

    body = client.get(CONSUMPTION_URL, params={"ingredient_id": ingredients["salsa"].id}).json()

    assert [(i["ingredient_name"], i["total_quantity"]) for i in body["items"]] == [("Salsa de tomate", 200)]


def test_un_ingrediente_sin_consumo_figura_en_cero_al_filtrarlo(client, db_session, products, ingredients, recipe):
    _order(db_session, [(products["muzza"], 2)])

    body = client.get(CONSUMPTION_URL, params={"ingredient_id": ingredients["huevo"].id}).json()

    assert body["items"] == [
        {"ingredient_id": ingredients["huevo"].id, "ingredient_name": "Huevo", "unit": "unidades", "total_quantity": 0},
    ]


def test_filtrar_por_un_ingrediente_inexistente_responde_404(client):
    assert client.get(CONSUMPTION_URL, params={"ingredient_id": 999}).status_code == 404


def test_sin_pedidos_finalizados_el_reporte_esta_vacio(client, recipe):
    assert client.get(CONSUMPTION_URL).json() == {"completed_orders": 0, "items": [], "products_without_recipe": []}
