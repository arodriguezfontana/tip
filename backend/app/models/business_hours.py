from sqlalchemy import CheckConstraint, Column, Integer, Time

from app.db.base_class import Base


class BusinessHours(Base):
    """Franja de atención del local en un día de la semana.

    Un día puede tener varias franjas (ej. mediodía y noche) y un día sin franjas está cerrado.
    Si el cierre es anterior o igual a la apertura, la franja termina al día siguiente
    (ej. 20:00 a 02:00). Mientras no haya ninguna franja cargada, el local no restringe pedidos.
    """

    __tablename__ = "business_hours"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_business_hours_day_of_week"),
        CheckConstraint("opens_at <> closes_at", name="ck_business_hours_range"),
    )

    id = Column(Integer, primary_key=True, index=True)
    # 0 = lunes ... 6 = domingo (igual que datetime.weekday()).
    day_of_week = Column(Integer, nullable=False)
    opens_at = Column(Time, nullable=False)
    closes_at = Column(Time, nullable=False)
