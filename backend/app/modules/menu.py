from sqlalchemy import Boolean, CheckConstraint, Column, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class ProductIngredient(Base):
    """Línea de la receta de un producto: cuánto de un ingrediente lleva una unidad del producto.

    La cantidad se expresa en la unidad de medida del ingrediente.
    """

    __tablename__ = "product_ingredients"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_product_ingredients_quantity"),)

    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True)

    quantity = Column(Float, nullable=False)

    product = relationship("Product", back_populates="recipe_items")
    ingredient = relationship("Ingredient", back_populates="used_in_products")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False) 

    products = relationship("Product", back_populates="category")


class Ingredient(Base):
    """Insumo de la lista maestra del local. Todas sus cantidades (en recetas y en los reportes de
    consumo) se expresan en su unidad de medida, para que siempre se puedan sumar."""

    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    unit = Column(String(30), nullable=False, server_default="unidades")

    used_in_products = relationship("ProductIngredient", back_populates="ingredient", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, index=True, nullable=False) 
    description = Column(Text, nullable=True)                           
    price = Column(Float, nullable=False)                              
    is_active = Column(Boolean, default=True, nullable=False)           

    preparation_time_minutes = Column(Integer, default=10, nullable=False)
    dietary_restrictions = Column(JSON, default=list, nullable=False)

    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    category = relationship("Category", back_populates="products")

    recipe_items = relationship("ProductIngredient", back_populates="product", cascade="all, delete-orphan")