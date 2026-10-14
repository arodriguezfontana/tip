from sqlalchemy.orm import Session

from app.modules.client import Client


def add(db: Session, client: Client) -> None:
    db.add(client)


def get(db: Session, client_id: int) -> Client | None:
    return db.get(Client, client_id)


def find_by_normalized_phone(db: Session, phone: str) -> Client | None:
    return db.query(Client).filter(Client.phone == phone).first()


def search(db: Session, text: str | None, offset: int, limit: int) -> tuple[list[Client], int]:
    """Página de clientes (de los más recientes a los más antiguos) cuyo nombre o teléfono contiene el texto,
    y el total de coincidencias."""
    query = db.query(Client)
    if text:
        pattern = f"%{text}%"
        query = query.filter(Client.full_name.ilike(pattern) | Client.phone.ilike(pattern))
    total = query.count()
    clients = query.order_by(Client.created_at.desc(), Client.id.desc()).offset(offset).limit(limit).all()
    return clients, total
