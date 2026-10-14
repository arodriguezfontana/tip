"""Base declarativa con todos los modelos registrados.

Importar los modelos acá hace que SQLAlchemy (create_all en los tests) y Alembic (autogenerate y check)
conozcan todas las tablas. Se listan en __all__ para que el linter no los tome como imports sin usar.
"""

from app.db.base_class import Base
from app.models.client import Client
from app.models.menu import Category, Ingredient, Product, ProductImage, ProductIngredient
from app.models.order import Order, OrderItem
from app.models.user import User

__all__ = [
    "Base",
    "Category",
    "Client",
    "Ingredient",
    "Order",
    "OrderItem",
    "Product",
    "ProductImage",
    "ProductIngredient",
    "User",
]
