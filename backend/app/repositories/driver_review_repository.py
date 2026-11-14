from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.driver_review import DriverReview


def create_review(
    db: Session,
    delivery_driver_id: int,
    order_id: int,
    rating: int | None,
    comment: str | None,
) -> DriverReview:
    review = DriverReview(
        delivery_driver_id=delivery_driver_id,
        order_id=order_id,
        rating=rating,
        comment=comment.strip() if comment else None,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def get_driver_reviews(db: Session, delivery_driver_id: int) -> list[DriverReview]:
    return (
        db.query(DriverReview)
        .filter(DriverReview.delivery_driver_id == delivery_driver_id)
        .order_by(DriverReview.created_at.desc(), DriverReview.id.desc())
        .all()
    )


def get_driver_rating_stats(db: Session, delivery_driver_id: int) -> tuple[float | None, int, int]:
    """Calcula el promedio de puntaje (solo sobre las que tienen rating), cantidad de calificaciones con puntaje y total de reseñas."""
    row = (
        db.query(
            func.avg(DriverReview.rating),
            func.count(DriverReview.rating),
            func.count(DriverReview.id),
        )
        .filter(DriverReview.delivery_driver_id == delivery_driver_id)
        .first()
    )
    if not row or row[1] == 0:
        return None, 0, (row[2] if row else 0)
    avg_val = round(float(row[0]), 1) if row[0] is not None else None
    return avg_val, int(row[1]), int(row[2])


def get_all_drivers_rating_stats(db: Session) -> dict[int, tuple[float | None, int, int]]:
    """Devuelve {driver_id: (rating_average, ratings_count, total_reviews)} para todos los repartidores."""
    rows = (
        db.query(
            DriverReview.delivery_driver_id,
            func.avg(DriverReview.rating),
            func.count(DriverReview.rating),
            func.count(DriverReview.id),
        )
        .group_by(DriverReview.delivery_driver_id)
        .all()
    )
    result = {}
    for driver_id, avg_r, count_r, count_total in rows:
        avg_val = round(float(avg_r), 1) if (avg_r is not None and count_r > 0) else None
        result[driver_id] = (avg_val, int(count_r), int(count_total))
    return result
