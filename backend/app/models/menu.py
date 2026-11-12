from collections.abc import Iterable
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
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
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship, validates

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

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True)

    quantity: Mapped[float] = mapped_column(Float, nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="recipe_items")
    ingredient: Mapped["Ingredient"] = relationship("Ingredient", back_populates="used_in_products")


class ProductAllowedExtra(Base):
    """Adicional permitido para un producto: insumo que se puede sumar como extra al pedirlo."""

    __tablename__ = "product_allowed_extras"

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True)

    product: Mapped["Product"] = relationship("Product", back_populates="allowed_extra_items")
    ingredient: Mapped["Ingredient"] = relationship("Ingredient", back_populates="allowed_in_products")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    sector: Mapped[str] = mapped_column(String(50), nullable=False, default="cocina", server_default="cocina")

    products: Mapped[list["Product"]] = relationship("Product", back_populates="category")

    def replace_products(self, products: Iterable["Product"]) -> None:
        """Deja en la categoría exactamente esos productos.

        Un producto pertenece a una sola categoría: si estaba en otra, se mueve. Los que se quitan quedan sin
        categoría (y no se ofrecen) hasta que se les asigne una.
        """
        new_products = list(products)
        keep_ids = {product.id for product in new_products}
        for product in [p for p in self.products if p.id not in keep_ids]:
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False, server_default="unidades")
    cost: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False, default=0, server_default="0")
    extra_price: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False, default=0, server_default="0")

    used_in_products: Mapped[list["ProductIngredient"]] = relationship("ProductIngredient", back_populates="ingredient", cascade="all, delete-orphan")
    allowed_in_products: Mapped[list["ProductAllowedExtra"]] = relationship("ProductAllowedExtra", back_populates="ingredient", cascade="all, delete-orphan")

    @validates("cost", "extra_price")
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    preparation_time_minutes: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    dietary_restrictions: Mapped[Any] = mapped_column(JSON, default=list, nullable=False)

    # Un producto queda sin categoría si se lo quita de la suya desde el panel: mientras tanto no se ofrece.
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True)
    category: Mapped["Category | None"] = relationship("Category", back_populates="products")
    sector: Mapped[str | None] = mapped_column(String(50), nullable=True)

    recipe_items: Mapped[list["ProductIngredient"]] = relationship("ProductIngredient", back_populates="product", cascade="all, delete-orphan")
    allowed_extra_items: Mapped[list["ProductAllowedExtra"]] = relationship("ProductAllowedExtra", back_populates="product", cascade="all, delete-orphan")
    image: Mapped["ProductImage | None"] = relationship("ProductImage", back_populates="product", uselist=False, cascade="all, delete-orphan")

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
        self.price = Decimal(str(price))
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

    @property
    def allowed_extras(self) -> list[Ingredient]:
        return [item.ingredient for item in self.allowed_extra_items if item.ingredient]

    def replace_allowed_extras(self, ingredients: Iterable[Ingredient]) -> None:
        current = {item.ingredient_id: item for item in self.allowed_extra_items}
        new_items = {ing.id: ing for ing in ingredients}
        for item in [item for ing_id, item in current.items() if ing_id not in new_items]:
            self.allowed_extra_items.remove(item)
        self.allowed_extra_items.extend(
            ProductAllowedExtra(ingredient=ing) for ing_id, ing in new_items.items() if ing_id not in current
        )

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
        for item in [item for ingredient_id, item in current.items() if ingredient_id not in new]:
            self.recipe_items.remove(item)
        for ingredient_id in current.keys() & new.keys():
            current[ingredient_id].quantity = new[ingredient_id][1]
        self.recipe_items.extend(
            ProductIngredient(ingredient=ingredient, quantity=quantity)
            for ingredient_id, (ingredient, quantity) in new.items()
            if ingredient_id not in current
        )


class ProductImage(Base):
    """Imagen (JPG o PNG) de un producto. Se guarda aparte para no traer los bytes al listar productos."""

    __tablename__ = "product_images"

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    product: Mapped["Product"] = relationship("Product", back_populates="image")

    @staticmethod
    def content_type_of(data: bytes) -> str:
        """Tipo de la imagen según su contenido. Solo se aceptan JPG y PNG de hasta MAX_IMAGE_MB."""
        if len(data) > MAX_IMAGE_BYTES:
            raise InvalidImageError(f"La imagen no puede pesar más de {MAX_IMAGE_MB} MB.")
        content_type = next((kind for signature, kind in _IMAGE_SIGNATURES.items() if data.startswith(signature)), None)
        if content_type is None:
            raise InvalidImageError("La imagen tiene que ser un archivo JPG o PNG.")
        return content_type
