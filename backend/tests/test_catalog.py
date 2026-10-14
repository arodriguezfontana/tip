"""Catálogo del panel: alta y edición de productos (con imagen) y de categorías, y su reflejo en el menú."""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.modules.menu import Category, Product, ProductImage
from app.modules.menu import MAX_IMAGE_BYTES
from app.services.tools.menu_tools import obtener_menu_actual
from tests.conftest import TestingSessionLocal

PRODUCTS_URL = "/api/v1/products"
CATEGORIES_URL = "/api/v1/categories"
MENU_URL = "/api/v1/menu/products"

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


@pytest.fixture()
def bebidas(db_session):
    categoria = Category(name="Bebidas")
    db_session.add(categoria)
    db_session.commit()
    return categoria


def _product_payload(category_id: int, **overrides) -> dict:
    return {
        "name": "Fugazzeta",
        "description": "Cebolla y muzzarella.",
        "price": 9500,
        "category_id": category_id,
        **overrides,
    }


def _menu(client) -> dict[str, str]:
    """Nombre de cada producto del menú público -> nombre de su categoría."""
    return {p["name"]: p["category"]["name"] for p in client.get(MENU_URL).json()}


# --- Productos ----------------------------------------------------------------------------------------


def test_crea_un_producto_y_aparece_en_el_menu_publico(client, db_session, muzza):
    payload = _product_payload(
        muzza.category_id, name="  Fugazzeta ", dietary_restrictions=["vegetariano", " Vegetariano ", ""]
    )

    response = client.post(PRODUCTS_URL, json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "Fugazzeta",
        "description": "Cebolla y muzzarella.",
        "price": 9500,
        "is_active": True,
        "dietary_restrictions": ["vegetariano"],
        "category": {"id": muzza.category_id, "name": "Pizzas"},
        "image_url": None,
        "recipe": [],
    }
    assert _menu(client)["Fugazzeta"] == "Pizzas"


@pytest.mark.parametrize(
    "overrides",
    [{"name": " "}, {"description": ""}, {"price": 0}, {"price": -10}, {"category_id": None}],
)
def test_nombre_descripcion_precio_y_categoria_son_obligatorios(client, muzza, overrides):
    assert client.post(PRODUCTS_URL, json={**_product_payload(muzza.category_id), **overrides}).status_code == 422


def test_no_permite_productos_con_el_mismo_nombre(client, muzza):
    response = client.post(PRODUCTS_URL, json=_product_payload(muzza.category_id, name="pizza muzzarella"))

    assert response.status_code == 409
    assert response.json()["detail"] == "Ya existe un producto llamado 'pizza muzzarella'."


def test_la_categoria_del_producto_tiene_que_existir(client, muzza):
    response = client.post(PRODUCTS_URL, json=_product_payload(999))

    assert response.status_code == 409
    assert "La categoría elegida no existe" in response.json()["detail"]


def test_edita_toda_la_informacion_de_un_producto(client, db_session, muzza, bebidas):
    response = client.put(
        f"{PRODUCTS_URL}/{muzza.id}",
        json=_product_payload(bebidas.id, name="Muzza grande", price=10000, is_active=False),
    )

    assert response.status_code == 200
    db_session.refresh(muzza)
    assert (muzza.name, muzza.description, muzza.price, muzza.category_id, muzza.is_active) == (
        "Muzza grande",
        "Cebolla y muzzarella.",
        10000,
        bebidas.id,
        False,
    )
    assert "Muzza grande" not in _menu(client)


def test_al_editar_puede_conservar_su_propio_nombre(client, muzza):
    payload = _product_payload(muzza.category_id, name="Pizza Muzzarella", price=9000)

    assert client.put(f"{PRODUCTS_URL}/{muzza.id}", json=payload).status_code == 200


def test_editar_un_producto_inexistente_da_404(client, muzza):
    assert client.put(f"{PRODUCTS_URL}/999", json=_product_payload(muzza.category_id)).status_code == 404


def test_el_listado_del_panel_incluye_los_productos_sin_categoria_al_final(client, db_session, products):
    products["coca"].category_id = None
    db_session.commit()

    body = client.get(PRODUCTS_URL).json()

    assert body[-1]["name"] == "Coca-Cola 500ml"
    assert body[-1]["category"] is None


# --- Imagen del producto ------------------------------------------------------------------------------


def test_carga_la_imagen_y_se_sirve_publicamente(client, public_client, db_session, muzza):
    response = client.put(f"{PRODUCTS_URL}/{muzza.id}/image", content=PNG, headers={"Content-Type": "image/png"})

    assert response.status_code == 200
    image_url = response.json()["image_url"]
    assert image_url.startswith(f"/menu/products/{muzza.id}/image?v=")
    menu_item = next(p for p in client.get(MENU_URL).json() if p["id"] == muzza.id)
    assert menu_item["image_url"] == image_url

    imagen = public_client.get(f"/api/v1{image_url}")
    assert imagen.status_code == 200
    assert imagen.headers["content-type"] == "image/png"
    assert imagen.content == PNG


def test_reemplazar_la_imagen_cambia_su_url(client, db_session, muzza):
    url = f"{PRODUCTS_URL}/{muzza.id}/image"
    primera = client.put(url, content=PNG, headers={"Content-Type": "image/png"}).json()["image_url"]

    with patch("app.services.catalog_service.datetime") as reloj:
        reloj.now.return_value = datetime(2030, 1, 1, tzinfo=timezone.utc)
        segunda = client.put(url, content=JPG, headers={"Content-Type": "image/jpeg"}).json()["image_url"]

    assert segunda != primera
    imagen = db_session.query(ProductImage).one()
    assert imagen.content_type == "image/jpeg"


def test_el_formato_se_valida_por_el_contenido_del_archivo(client, db_session, muzza):
    response = client.put(
        f"{PRODUCTS_URL}/{muzza.id}/image", content=b"GIF89a" + b"\x00" * 10, headers={"Content-Type": "image/png"}
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "La imagen tiene que ser un archivo JPG o PNG."
    assert db_session.query(ProductImage).count() == 0


def test_la_imagen_no_puede_superar_los_5_mb(client, db_session, muzza):
    pesada = PNG + b"\x00" * MAX_IMAGE_BYTES

    response = client.put(f"{PRODUCTS_URL}/{muzza.id}/image", content=pesada, headers={"Content-Type": "image/png"})

    assert response.status_code == 413
    assert response.json()["detail"] == "La imagen no puede pesar más de 5 MB."
    assert db_session.query(ProductImage).count() == 0


def test_elimina_la_imagen(client, public_client, db_session, muzza):
    client.put(f"{PRODUCTS_URL}/{muzza.id}/image", content=PNG, headers={"Content-Type": "image/png"})

    response = client.delete(f"{PRODUCTS_URL}/{muzza.id}/image")

    assert response.status_code == 200
    assert response.json()["image_url"] is None
    assert db_session.query(ProductImage).count() == 0
    assert public_client.get(f"/api/v1/menu/products/{muzza.id}/image").status_code == 404


def test_imagen_de_un_producto_inexistente_da_404(client):
    assert client.put(f"{PRODUCTS_URL}/999/image", content=PNG).status_code == 404
    assert client.delete(f"{PRODUCTS_URL}/999/image").status_code == 404


# --- Categorías ---------------------------------------------------------------------------------------


def test_lista_las_categorias_con_sus_productos(client, products, bebidas):
    body = client.get(CATEGORIES_URL).json()

    assert [(c["name"], [p["name"] for p in c["products"]]) for c in body] == [
        ("Bebidas", []),
        ("Pizzas", ["Coca-Cola 500ml", "Pizza Agotada", "Pizza Muzzarella"]),
    ]


def test_crea_una_categoria_sin_productos(client, db_session):
    response = client.post(CATEGORIES_URL, json={"name": "  Empanadas "})

    assert response.status_code == 201
    assert response.json() == {"id": response.json()["id"], "name": "Empanadas", "products": []}
    assert db_session.query(Category).one().name == "Empanadas"


def test_crea_una_categoria_moviendo_productos_existentes(client, db_session, products):
    response = client.post(CATEGORIES_URL, json={"name": "Bebidas", "product_ids": [products["coca"].id]})

    assert response.status_code == 201
    assert [p["name"] for p in response.json()["products"]] == ["Coca-Cola 500ml"]
    assert _menu(client) == {"Coca-Cola 500ml": "Bebidas", "Pizza Muzzarella": "Pizzas"}


def test_no_permite_categorias_con_el_mismo_nombre(client, products):
    response = client.post(CATEGORIES_URL, json={"name": "pizzas"})

    assert response.status_code == 409
    assert response.json()["detail"] == "Ya existe una categoría llamada 'pizzas'."


def test_no_permite_productos_inexistentes(client, db_session, products):
    response = client.post(CATEGORIES_URL, json={"name": "Bebidas", "product_ids": [products["coca"].id, 999]})

    assert response.status_code == 409
    assert db_session.query(Category).count() == 1


@pytest.mark.parametrize("payload", [{"name": ""}, {"name": "   "}, {}])
def test_el_nombre_de_la_categoria_es_obligatorio(client, payload):
    assert client.post(CATEGORIES_URL, json=payload).status_code == 422


def test_edita_el_nombre_y_los_productos_de_una_categoria(client, db_session, products, bebidas):
    pizzas_id = products["muzza"].category_id

    response = client.put(
        f"{CATEGORIES_URL}/{bebidas.id}", json={"name": "Bebidas frías", "product_ids": [products["coca"].id]}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Bebidas frías"
    assert _menu(client) == {"Coca-Cola 500ml": "Bebidas frías", "Pizza Muzzarella": "Pizzas"}

    # Se quita la muzza de Pizzas: queda sin categoría y deja de ofrecerse.
    response = client.put(
        f"{CATEGORIES_URL}/{pizzas_id}", json={"name": "Pizzas", "product_ids": [products["agotada"].id]}
    )
    assert [p["name"] for p in response.json()["products"]] == ["Pizza Agotada"]
    db_session.refresh(products["muzza"])
    assert products["muzza"].category_id is None
    assert _menu(client) == {"Coca-Cola 500ml": "Bebidas frías"}


def test_editar_una_categoria_inexistente_da_404(client):
    assert client.put(f"{CATEGORIES_URL}/999", json={"name": "X"}).status_code == 404


def test_eliminar_una_categoria_deja_sus_productos_sin_categoria(client, db_session, products):
    pizzas_id = products["muzza"].category_id

    assert client.delete(f"{CATEGORIES_URL}/{pizzas_id}").status_code == 204

    assert db_session.query(Category).count() == 0
    assert db_session.query(Product).filter(Product.category_id.is_(None)).count() == 3
    assert _menu(client) == {}
    assert client.delete(f"{CATEGORIES_URL}/{pizzas_id}").status_code == 404


def test_un_producto_sin_categoria_no_se_puede_pedir(client, db_session, products):
    products["muzza"].category_id = None
    db_session.commit()

    response = client.post(
        "/api/v1/orders/web",
        json={
            "customer_name": "Ana",
            "customer_phone": "1155551234",
            "delivery_method": "retiro",
            "items": [{"product_id": products["muzza"].id, "quantity": 1}],
        },
    )

    assert response.status_code == 400
    assert "Pizza Muzzarella" in response.json()["detail"]


def test_los_cambios_del_catalogo_se_reflejan_en_el_menu_del_chatbot(client, db_session, products):
    client.post(CATEGORIES_URL, json={"name": "Bebidas", "product_ids": [products["coca"].id]})
    client.put(
        f"{PRODUCTS_URL}/{products['muzza'].id}",
        json=_product_payload(products["muzza"].category_id, name="Muzza", description="La clásica."),
    )

    with patch("app.services.tools.menu_tools.SessionLocal", TestingSessionLocal):
        menu = obtener_menu_actual()

    assert "- Muzza ($9,500.00) [Pizzas]: La clásica." in menu
    assert "- Coca-Cola 500ml ($2,500.00) [Bebidas]" in menu
    assert "Pizza Agotada" not in menu


def test_el_catalogo_es_solo_para_administradores(public_client, customer_headers):
    for method, url in [
        ("post", PRODUCTS_URL),
        ("put", f"{PRODUCTS_URL}/1"),
        ("put", f"{PRODUCTS_URL}/1/image"),
        ("delete", f"{PRODUCTS_URL}/1/image"),
        ("get", CATEGORIES_URL),
        ("post", CATEGORIES_URL),
        ("put", f"{CATEGORIES_URL}/1"),
        ("delete", f"{CATEGORIES_URL}/1"),
    ]:
        assert getattr(public_client, method)(url).status_code == 401
        assert getattr(public_client, method)(url, headers=customer_headers).status_code == 403
