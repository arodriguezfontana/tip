from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.db.base_class import Base

ROLE_ADMIN = "ADMIN"
ROLE_CUSTOMER = "CUSTOMER"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default=ROLE_ADMIN)
    is_active = Column(Boolean, nullable=False, default=True)
    # Datos personales de los clientes registrados desde la web (vacíos para administradores).
    full_name = Column(String(150), nullable=True)
    phone = Column(String(30), nullable=True)
    address = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
