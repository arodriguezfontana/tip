from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User


def add(db: Session, user: User) -> None:
    db.add(user)


def get(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def find_by_email(db: Session, email: str) -> User | None:
    """Sin distinguir mayúsculas ni espacios alrededor."""
    return db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
