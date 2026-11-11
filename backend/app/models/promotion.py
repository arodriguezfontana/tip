from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship, validates
from sqlalchemy.sql import func

from app.core.errors import BusinessRuleError
from app.core.money import MoneyColumn, to_money
from app.db.base_class import Base
from app.models.menu import Product, ProductImage

MAX_PROMOTION_IMAGES = 5


class PromotionProduct(Base):
    """Producto incluido en una promoción con su cantidad."""

    __tablename__ = "promotion_products"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_promotion_products_quantity"),)

    promotion_id: Mapped[int] = mapped_column(Integer, ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    promotion: Mapped["Promotion"] = relationship("Promotion", back_populates="items")
    product: Mapped["Product"] = relationship("Product")


class Promotion(Base):
    """Promoción configurada por el administrador que agrupa uno o más productos a un precio promocional."""

    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(MoneyColumn, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    items: Mapped[list["PromotionProduct"]] = relationship("PromotionProduct", back_populates="promotion", cascade="all, delete-orphan")
    photo: Mapped["PromotionPhoto | None"] = relationship("PromotionPhoto", uselist=False, cascade="all, delete-orphan")

    @validates("price")
    def _as_money(self, _key: str, value) -> Decimal:
        return to_money(value)

    @property
    def image_version(self) -> int | None:
        """Cambia cada vez que se reemplaza la imagen, o None."""
        try:
            if self.photo is None:
                return None
            return int(self.photo.updated_at.timestamp() * 1000)
        except Exception:
            return None

    def replace_image(self, data: bytes, now: datetime) -> None:
        content_type = ProductImage.content_type_of(data)
        if self.photo is None:
            self.photo = PromotionPhoto(content_type=content_type, data=data, updated_at=now)
        else:
            self.photo.content_type = content_type
            self.photo.data = data
            self.photo.updated_at = now

    def remove_image(self) -> None:
        self.photo = None

    @property
    def is_available(self) -> bool:
        """Una promoción está disponible si está activa, tiene productos y todos ellos están disponibles."""
        if not self.is_active or not self.items:
            return False
        return all(item.product is not None and item.product.is_available for item in self.items)

    def set_products(self, items: list[tuple[Product, int]]) -> None:
        """Define los productos incluidos en la promoción con sus cantidades."""
        if not items:
            raise BusinessRuleError("La promoción debe incluir al menos un producto.")
        if any(quantity < 1 for _, quantity in items):
            raise BusinessRuleError("La cantidad de cada producto debe ser mayor a cero.")
        product_ids = [product.id for product, _ in items]
        if len(product_ids) != len(set(product_ids)):
            raise BusinessRuleError("Un producto figura más de una vez en la promoción.")
        self.items = [PromotionProduct(product=product, quantity=quantity) for product, quantity in items]


class PromotionImage(Base):
    """Una de las imágenes con las promociones u ofertas del local para enviar a clientes."""

    __tablename__ = "promotion_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    @property
    def version(self) -> int:
        return int(self.updated_at.timestamp() * 1000)

    def replace(self, data: bytes, now: datetime) -> None:
        self.content_type = ProductImage.content_type_of(data)
        self.data = data
        self.size_bytes = len(data)
        self.updated_at = now


class PromotionPhoto(Base):
    """Foto o imagen de la promoción (JPG o PNG de hasta 5 MB)."""

    __tablename__ = "promotion_photos"

    promotion_id: Mapped[int] = mapped_column(Integer, ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
