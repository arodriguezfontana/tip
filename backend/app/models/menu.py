from collections.abc import Iterable
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    and_,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import deferred, relationship, validates

from app.core.errors import BusinessRuleError, ConflictError, UnsupportedFileError
from app.core.money import MoneyColumn, to_money
from app.db.base_class import Base

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_MB = MAX_IMAGE_BYTES // (1024 * 1024)

# El formato se reconoce por los primeros bytes del archivo, no por su nombre ni por lo que declara el navegador.
_IMAGE_SIGNATURES = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
}


class InvalidImageError(UnsupportedFileError):
    """La imagen no es JPG/PNG o es demasiado pesada."""


class InvalidRecipeError(BusinessRuleError):
    pass


class IngredientInUseError(ConflictError):
    pass


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
    sector = Column(String(50), nullable=False, default="cocina", server_default="cocina")

    products = relationship("Product", back_populates="category")

    def replace_products(self, products: Iterable["Product"]) -> None:
        """Deja en la categoría exactamente esos productos.

        Un producto pertenece a una sola categoría: si estaba en otra, se mueve. Los que se quitan quedan sin
        categoría (y no se ofrecen) hasta que se les asigne una.
        """
        new_products = list(products)
        keep_ids = {product.id for product in new_products}
        for product in list(self.products):
            if product.id not in keep_ids:
                product.category = None
        for product in new_products:
            product.category = self

    def release_products(self) -> None:
        """Antes de eliminar la categoría: sus productos quedan sin categoría (no se borran)."""
        self.replace_products([])


class Ingredient(Base):
    """Insumo de la lista maestra del local. Todas sus cantidades (en recetas y en los reportes de
    consumo) se expresan en su unidad de medida, para que siempre se puedan sumar."""

    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    unit = Column(String(30), nullable=False, server_default="unidades")
    extra_price = Column(MoneyColumn, nullable=False, default=0, server_default="0")

    used_in_products = relationship("ProductIngredient", back_populates="ingredient", cascade="all, delete-orphan")

    @validates("extra_price")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)

    def ensure_can_be_deleted(self) -> None:
        """Un ingrediente que figura en alguna receta no se puede borrar: el consumo dejaría de cerrar."""
        products = sorted(item.product.name for item in self.used_in_products)
        if products:
            raise IngredientInUseError(
                f"No se puede eliminar '{self.name}' porque forma parte de la receta de: {', '.join(products)}. "
                "Quitalo primero de esas recetas."
            )


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(MoneyColumn, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    preparation_time_minutes = Column(Integer, default=10, nullable=False)
    dietary_restrictions = Column(JSON, default=list, nullable=False)

    # Un producto queda sin categoría si se lo quita de la suya desde el panel: mientras tanto no se ofrece.
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="products")
    sector = Column(String(50), nullable=True)

    recipe_items = relationship("ProductIngredient", back_populates="product", cascade="all, delete-orphan")
    image = relationship("ProductImage", back_populates="product", uselist=False, cascade="all, delete-orphan")

    @property
    def effective_sector(self) -> str:
        if self.sector:
            return self.sector.lower()
        if self.category and getattr(self.category, "sector", None):
            return self.category.sector.lower()
        return "cocina"

    @validates("price")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)

    @hybrid_property
    def is_available(self) -> bool:
        """Se muestra en el menú (web y chatbot) y se puede pedir: está activo y tiene categoría."""
        return bool(self.is_active) and self.category_id is not None

    @is_available.inplace.expression
    @classmethod
    def _is_available_expression(cls):
        return and_(cls.is_active.is_(True), cls.category_id.isnot(None))

    def update_details(
        self,
        name: str,
        description: str,
        price: Decimal | float,
        category: Category,
        is_active: bool,
        dietary_restrictions: list[str],
    ) -> None:
        if price <= 0:
            raise BusinessRuleError("El precio tiene que ser mayor a cero.")
        self.name = name
        self.description = description
        self.price = price
        self.category = category
        # Se fija también el id: la disponibilidad depende de él y debe valer antes de guardar.
        self.category_id = category.id
        self.is_active = is_active
        self.dietary_restrictions = dietary_restrictions

    # --- Imagen -------------------------------------------------------------------------------------

    @property
    def image_version(self) -> int | None:
        """Cambia cada vez que se reemplaza la imagen (para que no se muestre una copia vieja), o None."""
        if self.image is None:
            return None
        return int(self.image.updated_at.timestamp() * 1000)

    def replace_image(self, data: bytes, now: datetime) -> None:
        content_type = ProductImage.content_type_of(data)
        if self.image is None:
            self.image = ProductImage(content_type=content_type, data=data, updated_at=now)
        else:
            self.image.content_type = content_type
            self.image.data = data
            self.image.updated_at = now

    def remove_image(self) -> None:
        self.image = None

    # --- Receta -------------------------------------------------------------------------------------

    def replace_recipe(self, lines: list[tuple[Ingredient, float]]) -> None:
        """Reemplaza la receta. Cada línea es (ingrediente, cantidad por unidad de producto)."""
        ids = [ingredient.id for ingredient, _ in lines]
        if len(ids) != len(set(ids)):
            raise InvalidRecipeError("Un ingrediente figura más de una vez en la receta.")
        if any(quantity <= 0 for _, quantity in lines):
            raise InvalidRecipeError("Las cantidades de la receta deben ser mayores a cero.")

        # Se actualizan las líneas existentes en lugar de recrearlas: comparten la clave (producto, ingrediente).
        current = {item.ingredient_id: item for item in self.recipe_items}
        new = {ingredient.id: (ingredient, quantity) for ingredient, quantity in lines}
        for ingredient_id, item in current.items():
            if ingredient_id not in new:
                self.recipe_items.remove(item)
        for ingredient_id, (ingredient, quantity) in new.items():
            if ingredient_id in current:
                current[ingredient_id].quantity = quantity
            else:
                self.recipe_items.append(ProductIngredient(ingredient=ingredient, quantity=quantity))


class ProductImage(Base):
    """Imagen (JPG o PNG) de un producto. Se guarda aparte para no traer los bytes al listar productos."""

    __tablename__ = "product_images"

    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    content_type = Column(String(20), nullable=False)
    data = deferred(Column(LargeBinary, nullable=False))
    updated_at = Column(DateTime(timezone=True), nullable=False)

    product = relationship("Product", back_populates="image")

    @staticmethod
    def content_type_of(data: bytes) -> str:
        """Tipo de la imagen según su contenido. Solo se aceptan JPG y PNG de hasta MAX_IMAGE_MB."""
        if len(data) > MAX_IMAGE_BYTES:
            raise InvalidImageError(f"La imagen no puede pesar más de {MAX_IMAGE_MB} MB.")
        for signature, content_type in _IMAGE_SIGNATURES.items():
            if data.startswith(signature):
                return content_type
        raise InvalidImageError("La imagen tiene que ser un archivo JPG o PNG.")
