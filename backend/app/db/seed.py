from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.modules.menu import Category, Ingredient, Product, ProductIngredient


def get_or_create(db: Session, model, defaults: dict | None = None, **kwargs):
    """Busca una fila por los campos en kwargs; si no existe, la crea."""
    instance = db.query(model).filter_by(**kwargs).first()
    if instance:
        return instance, False
    instance = model(**kwargs, **(defaults or {}))
    db.add(instance)
    db.flush()
    return instance, True


def seed_ingredientes(db: Session) -> dict[str, Ingredient]:
    nombres = [
        "Salsa de tomate",
        "Muzzarella",
        "Albahaca",
        "Tomate en rodajas",
        "Ajo",
        "Cebolla",
        "Jamón",
        "Morrones",
        "Longaniza calabresa",
        "Roquefort",
        "Aceitunas negras",
        "Panceta",
        "Huevo",
    ]
    ingredientes = {}
    for nombre in nombres:
        ingrediente, _ = get_or_create(db, Ingredient, name=nombre)
        ingredientes[nombre] = ingrediente
    return ingredientes


def agregar_receta(db: Session, producto: Product, ingredientes: dict[str, Ingredient], receta: list[tuple[str, float, str]]):
    for nombre, cantidad, unidad in receta:
        existe = (
            db.query(ProductIngredient)
            .filter_by(product_id=producto.id, ingredient_id=ingredientes[nombre].id)
            .first()
        )
        if existe:
            continue
        db.add(
            ProductIngredient(
                product_id=producto.id,
                ingredient_id=ingredientes[nombre].id,
                quantity=cantidad,
                unit_measure=unidad,
            )
        )


def seed_pizzas(db: Session, categoria: Category, ingredientes: dict[str, Ingredient]):
    pizzas = [
        {
            "name": "Pizza Muzzarella",
            "description": "La clásica: salsa de tomate, muzzarella y albahaca fresca.",
            "price": 8500.0,
            "preparation_time_minutes": 20,
            "dietary_restrictions": ["vegetariano"],
            "receta": [
                ("Salsa de tomate", 100, "gramos"),
                ("Muzzarella", 250, "gramos"),
                ("Albahaca", 5, "hojas"),
            ],
        },
        {
            "name": "Pizza Napolitana",
            "description": "Muzzarella, tomate en rodajas, ajo y albahaca.",
            "price": 9500.0,
            "preparation_time_minutes": 22,
            "dietary_restrictions": ["vegetariano"],
            "receta": [
                ("Salsa de tomate", 100, "gramos"),
                ("Muzzarella", 200, "gramos"),
                ("Tomate en rodajas", 80, "gramos"),
                ("Ajo", 5, "gramos"),
                ("Albahaca", 5, "hojas"),
            ],
        },
        {
            "name": "Pizza Fugazzeta",
            "description": "Doble muzzarella con abundante cebolla.",
            "price": 9800.0,
            "preparation_time_minutes": 20,
            "dietary_restrictions": ["vegetariano"],
            "receta": [
                ("Muzzarella", 300, "gramos"),
                ("Cebolla", 150, "gramos"),
            ],
        },
        {
            "name": "Pizza Especial",
            "description": "Salsa de tomate, muzzarella, jamón y morrones.",
            "price": 10500.0,
            "preparation_time_minutes": 22,
            "dietary_restrictions": [],
            "receta": [
                ("Salsa de tomate", 100, "gramos"),
                ("Muzzarella", 220, "gramos"),
                ("Jamón", 100, "gramos"),
                ("Morrones", 60, "gramos"),
            ],
        },
        {
            "name": "Pizza Calabresa",
            "description": "Muzzarella con longaniza calabresa y aceitunas negras.",
            "price": 10200.0,
            "preparation_time_minutes": 22,
            "dietary_restrictions": [],
            "receta": [
                ("Salsa de tomate", 100, "gramos"),
                ("Muzzarella", 220, "gramos"),
                ("Longaniza calabresa", 120, "gramos"),
                ("Aceitunas negras", 40, "gramos"),
            ],
        },
        {
            "name": "Pizza Roquefort",
            "description": "Muzzarella con generosas porciones de queso roquefort.",
            "price": 10800.0,
            "preparation_time_minutes": 20,
            "dietary_restrictions": ["vegetariano"],
            "receta": [
                ("Muzzarella", 220, "gramos"),
                ("Roquefort", 100, "gramos"),
            ],
        },
    ]

    for datos in pizzas:
        receta = datos.pop("receta")
        nombre = datos.pop("name")
        producto, creado = get_or_create(
            db,
            Product,
            name=nombre,
            defaults={**datos, "category_id": categoria.id},
        )
        if not creado:
            continue
        db.flush()
        agregar_receta(db, producto, ingredientes, receta)


def seed_bebidas(db: Session, categoria: Category):
    bebidas = [
        {"name": "Coca-Cola 500ml", "description": "Botella de 500ml.", "price": 2500.0, "preparation_time_minutes": 2},
        {"name": "Agua Mineral 500ml", "description": "Sin gas o con gas.", "price": 1800.0, "preparation_time_minutes": 1},
        {"name": "Cerveza Quilmes 1L", "description": "Botella retornable de 1 litro.", "price": 3200.0, "preparation_time_minutes": 2},
    ]
    for datos in bebidas:
        nombre = datos.pop("name")
        get_or_create(
            db,
            Product,
            name=nombre,
            defaults={**datos, "dietary_restrictions": [], "category_id": categoria.id},
        )


def seed_postres(db: Session, categoria: Category):
    postres = [
        {
            "name": "Flan casero",
            "description": "Con dulce de leche y crema.",
            "price": 3500.0,
            "preparation_time_minutes": 5,
            "dietary_restrictions": ["vegetariano"],
        },
        {
            "name": "Helado 2 bochas",
            "description": "A elección de sabores disponibles.",
            "price": 4000.0,
            "preparation_time_minutes": 5,
            "dietary_restrictions": ["vegetariano"],
        },
    ]
    for datos in postres:
        nombre = datos.pop("name")
        get_or_create(
            db,
            Product,
            name=nombre,
            defaults={**datos, "category_id": categoria.id},
        )


def run():
    db = SessionLocal()
    try:
        categoria_pizzas, _ = get_or_create(db, Category, name="Pizzas")
        categoria_bebidas, _ = get_or_create(db, Category, name="Bebidas")
        categoria_postres, _ = get_or_create(db, Category, name="Postres")
        db.flush()

        ingredientes = seed_ingredientes(db)
        db.flush()

        seed_pizzas(db, categoria_pizzas, ingredientes)
        seed_bebidas(db, categoria_bebidas)
        seed_postres(db, categoria_postres)

        db.commit()
        print("Seed completado: categorías, ingredientes y productos de la pizzería cargados.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
