"""Base declarativa con todos los modelos registrados.

Importar los modelos acá hace que SQLAlchemy (create_all en los tests) y Alembic (autogenerate y check)
conozcan todas las tablas. Se listan en __all__ para que el linter no los tome como imports sin usar.
"""

from app.db.base_class import Base
from app.models.business_hours import BusinessHours
from app.models.cash_shift import CashMovement, CashShift
from app.models.client import Client
from app.models.delivery_driver import DeliveryDriver
from app.models.menu import Category, Ingredient, Product, ProductImage, ProductIngredient
from app.models.menu_image import MenuImage
from app.models.order import Order, OrderItem
from app.models.promotion import Promotion, PromotionImage, PromotionPhoto, PromotionProduct
from app.models.store_config import StoreConfig
from app.models.user import User

__all__ = [
    "Base",
    "BusinessHours",
    "CashMovement",
    "CashShift",
    "Category",
    "Client",
    "DeliveryDriver",
    "Ingredient",
    "MenuImage",
    "Order",
    "OrderItem",
    "Product",
    "ProductImage",
    "ProductIngredient",
    "Promotion",
    "PromotionImage",
    "PromotionPhoto",
    "PromotionProduct",
    "StoreConfig",
    "User",
]
