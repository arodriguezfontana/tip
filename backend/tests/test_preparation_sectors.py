from app.models.menu import Category, Product
from app.models.order import Order, OrderItem

CATEGORIES_URL = "/api/v1/categories"
ORDERS_URL = "/api/v1/orders"


def test_crear_categoria_con_sector(client, db_session):
    response = client.post(CATEGORIES_URL, json={"name": "Pizzas Especiales", "sector": "pizzeria"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Pizzas Especiales"
    assert data["sector"] == "pizzeria"


def test_editar_sector_de_categoria(client, db_session):
    cat = Category(name="Tragos", sector="cocina")
    db_session.add(cat)
    db_session.commit()

    response = client.put(f"{CATEGORIES_URL}/{cat.id}", json={"name": "Tragos", "sector": "barra"})
    assert response.status_code == 200
    assert response.json()["sector"] == "barra"


def test_item_de_pedido_hereda_sector_de_categoria(client, db_session):
    cat_pizzeria = Category(name="Pizzas", sector="pizzeria")
    cat_barra = Category(name="Bebidas", sector="barra")
    cat_cocina = Category(name="Postres", sector="cocina")
    db_session.add_all([cat_pizzeria, cat_barra, cat_cocina])
    db_session.commit()

    p_pizza = Product(name="Muzza", price=1000, category_id=cat_pizzeria.id)
    p_bebida = Product(name="Agua", price=500, category_id=cat_barra.id)
    p_postre = Product(name="Flan", price=800, category_id=cat_cocina.id)
    db_session.add_all([p_pizza, p_bebida, p_postre])
    db_session.commit()

    order = Order(
        customer_name="Test Client",
        shipping_address="Calle 123",
        delivery_method="retiro",
        total_amount=2300,
        status="Confirmado",
    )
    order.items = [
        OrderItem(product_id=p_pizza.id, quantity=1, unit_price=1000),
        OrderItem(product_id=p_bebida.id, quantity=1, unit_price=500),
        OrderItem(product_id=p_postre.id, quantity=1, unit_price=800),
    ]
    db_session.add(order)
    db_session.commit()

    response = client.get(f"{ORDERS_URL}/{order.id}")
    assert response.status_code == 200
    body = response.json()

    assert set(body["sectors"]) == {"pizzeria", "barra", "cocina"}

    items_by_sector = {item["product_name"]: item["sector"] for item in body["items"]}
    assert items_by_sector["Muzza"] == "pizzeria"
    assert items_by_sector["Agua"] == "barra"
    assert items_by_sector["Flan"] == "cocina"


def test_filtrar_pedidos_por_sector(client, db_session):
    cat_pizzeria = Category(name="Pizzas", sector="pizzeria")
    cat_barra = Category(name="Bebidas", sector="barra")
    db_session.add_all([cat_pizzeria, cat_barra])
    db_session.commit()

    p_pizza = Product(name="Muzza", price=1000, category_id=cat_pizzeria.id)
    p_bebida = Product(name="Agua", price=500, category_id=cat_barra.id)
    db_session.add_all([p_pizza, p_bebida])
    db_session.commit()

    # Pedido 1: solo pizzería
    o1 = Order(customer_name="Solo Pizzeria", shipping_address="Calle 1", total_amount=1000, status="Confirmado")
    o1.items = [OrderItem(product_id=p_pizza.id, quantity=1, unit_price=1000)]

    # Pedido 2: solo barra
    o2 = Order(customer_name="Solo Barra", shipping_address="Calle 2", total_amount=500, status="Confirmado")
    o2.items = [OrderItem(product_id=p_bebida.id, quantity=1, unit_price=500)]

    # Pedido 3: ambos
    o3 = Order(customer_name="Ambos", shipping_address="Calle 3", total_amount=1500, status="Confirmado")
    o3.items = [
        OrderItem(product_id=p_pizza.id, quantity=1, unit_price=1000),
        OrderItem(product_id=p_bebida.id, quantity=1, unit_price=500),
    ]

    db_session.add_all([o1, o2, o3])
    db_session.commit()

    # Filtrar por pizzeria
    resp_pizzeria = client.get(ORDERS_URL, params={"sector": "pizzeria"})
    assert resp_pizzeria.status_code == 200
    ids_pizzeria = {o["id"] for o in resp_pizzeria.json()}
    assert ids_pizzeria == {o1.id, o3.id}

    # Filtrar por barra
    resp_barra = client.get(ORDERS_URL, params={"sector": "barra"})
    assert resp_barra.status_code == 200
    ids_barra = {o["id"] for o in resp_barra.json()}
    assert ids_barra == {o2.id, o3.id}
