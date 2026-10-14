from sqlalchemy.orm import Session

from app.models.business_hours import BusinessHours


def list_ordered(db: Session) -> list[BusinessHours]:
    """Franjas de atención por día de la semana y hora de apertura."""
    return db.query(BusinessHours).order_by(BusinessHours.day_of_week, BusinessHours.opens_at).all()


def replace_all(db: Session, ranges: list[BusinessHours]) -> None:
    """Reemplaza todas las franjas guardadas por las indicadas (sin confirmar la transacción)."""
    db.query(BusinessHours).delete()
    db.add_all(ranges)
