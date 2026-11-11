from sqlalchemy.orm import Session

from app.models.printer import Printer


def list_all(db: Session) -> list[Printer]:
    return db.query(Printer).order_by(Printer.id).all()


def delete_all(db: Session) -> None:
    db.query(Printer).delete()
    db.flush()


def add(db: Session, printer: Printer) -> Printer:
    """Registra la impresora (sin confirmar la transacción)."""
    db.add(printer)
    db.flush()
    return printer
