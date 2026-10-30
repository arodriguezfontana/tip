from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.promotion import Promotion, PromotionImage, PromotionProduct
from app.repositories.common import name_taken as _name_taken


def add(db: Session, promotion: Promotion) -> None:
    db.add(promotion)


def delete(db: Session, promotion: Promotion) -> None:
    db.delete(promotion)


def get(db: Session, promotion_id: int) -> Promotion | None:
    return (
        db.query(Promotion)
        .options(joinedload(Promotion.items).joinedload(PromotionProduct.product))
        .filter(Promotion.id == promotion_id)
        .first()
    )


def get_many(db: Session, promotion_ids: set[int]) -> dict[int, Promotion]:
    if not promotion_ids:
        return {}
    promos = (
        db.query(Promotion)
        .options(joinedload(Promotion.items).joinedload(PromotionProduct.product))
        .filter(Promotion.id.in_(promotion_ids))
        .all()
    )
    return {p.id: p for p in promos}


def name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    return _name_taken(db, Promotion, name, exclude_id)


def list_all(db: Session) -> list[Promotion]:
    return (
        db.query(Promotion)
        .options(joinedload(Promotion.items).joinedload(PromotionProduct.product))
        .order_by(Promotion.is_active.desc(), Promotion.name)
        .all()
    )


def list_available(db: Session) -> list[Promotion]:
    promos = (
        db.query(Promotion)
        .options(joinedload(Promotion.items).joinedload(PromotionProduct.product))
        .filter(Promotion.is_active.is_(True))
        .order_by(Promotion.name)
        .all()
    )
    return [p for p in promos if p.is_available]


def find_available_by_name(db: Session, name: str) -> list[Promotion]:
    name_clean = name.strip().lower()
    exact = (
        db.query(Promotion)
        .options(joinedload(Promotion.items).joinedload(PromotionProduct.product))
        .filter(Promotion.is_active.is_(True), func.lower(Promotion.name) == name_clean)
        .first()
    )
    if exact and exact.is_available:
        return [exact]

    matches = (
        db.query(Promotion)
        .options(joinedload(Promotion.items).joinedload(PromotionProduct.product))
        .filter(Promotion.is_active.is_(True), Promotion.name.ilike(f"%{name_clean}%"))
        .order_by(Promotion.name)
        .all()
    )
    return [p for p in matches if p.is_available]


# --- Imágenes de promociones ---


def list_promotion_images(db: Session) -> list[PromotionImage]:
    return list(db.scalars(select(PromotionImage).order_by(PromotionImage.position, PromotionImage.id)))


def get_promotion_image(db: Session, image_id: int) -> PromotionImage | None:
    return db.get(PromotionImage, image_id)


def add_promotion_image(db: Session, image: PromotionImage) -> None:
    db.add(image)


def delete_promotion_image(db: Session, image: PromotionImage) -> None:
    db.delete(image)

