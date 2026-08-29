from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class ProductIngredient(Base):
    __tablename__ = "product_ingredients"

    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True)
    
    quantity = Column(Float, nullable=False, default=1.0)           
    unit_measure = Column(String(50), nullable=False, default="unidades")

    product = relationship("Product", back_populates="recipe_items")
    ingredient = relationship("Ingredient", back_populates="used_in_products")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False) 

    products = relationship("Product", back_populates="category")


class Ingredient(Base):
    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False) 

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