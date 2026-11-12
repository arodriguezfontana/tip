from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base_class import Base

ROLE_ADMIN = "ADMIN"
ROLE_CUSTOMER = "CUSTOMER"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=ROLE_ADMIN)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Datos personales de los clientes registrados desde la web (vacíos para administradores).
    full_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def is_customer(self) -> bool:
        return self.role == ROLE_CUSTOMER

    def update_profile(self, full_name: str, phone: str, address: str) -> None:
        """Datos personales que el cliente guarda para autocompletar sus pedidos."""
        self.full_name = full_name
        self.phone = phone
        self.address = address
