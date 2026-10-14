from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, JSON, and_
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import deferred, relationship
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

    # Un producto queda sin categoría si se lo quita de la suya desde el panel: mientras tanto no se ofrece.
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="products")

    recipe_items = relationship("ProductIngredient", back_populates="product", cascade="all, delete-orphan")
    image = relationship("ProductImage", back_populates="product", uselist=False, cascade="all, delete-orphan")

    @hybrid_property
    def is_available(self) -> bool:
        """Se muestra en el menú (web y chatbot) y se puede pedir: está activo y tiene categoría."""
        return bool(self.is_active) and self.category_id is not None

    @is_available.inplace.expression
    @classmethod
    def _is_available_expression(cls):
        return and_(cls.is_active.is_(True), cls.category_id.isnot(None))

    @property
    def image_url(self) -> str | None:
        """Ruta de la imagen, relativa a la API. Cambia al reemplazarla para que no se muestre una copia vieja."""
        if self.image is None:
            return None
        return f"/menu/products/{self.id}/image?v={int(self.image.updated_at.timestamp() * 1000)}"


class ProductImage(Base):
    """Imagen (JPG o PNG) de un producto. Se guarda aparte para no traer los bytes al listar productos."""

    __tablename__ = "product_images"

    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    content_type = Column(String(20), nullable=False)
    data = deferred(Column(LargeBinary, nullable=False))
    updated_at = Column(DateTime(timezone=True), nullable=False)

    product = relationship("Product", back_populates="image")