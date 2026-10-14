"""Agenda de clientes del local: búsqueda por teléfono, listado y alta/actualización al cargar pedidos."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.session import transaction
from app.modules.client import Client
from app.repositories import client_repository


@dataclass(frozen=True)
class ClientPage:
    items: list[Client]
    total: int
    page: int
    per_page: int

    @property
    def total_pages(self) -> int:
        return max(1, -(-self.total // self.per_page))


def _find_by_phone(db: Session, phone: str) -> Client | None:
    normalized = Client.normalize_phone(phone)
    return client_repository.find_by_normalized_phone(db, normalized) if normalized else None


def find_client_by_phone(db: Session, phone: str) -> Client:
    client = _find_by_phone(db, phone)
    if client is None:
        raise NotFoundError("Cliente no registrado")
    return client


def upsert_client(db: Session, phone: str, full_name: str, address: str | None) -> Client:
    """Registra al cliente o lo actualiza con los datos de su último pedido.

    No confirma la transacción: se usa dentro de la del caso de uso que registra el pedido.
    """
    client = _find_by_phone(db, phone)
    if client is None:
        client = Client(phone=phone, full_name=full_name, address=address)
        client_repository.add(db, client)
        return client
    client.register_order_contact(full_name, address)
    return client


def list_clients(db: Session, search: str | None = None, page: int = 1, per_page: int = 20) -> ClientPage:
    """Clientes de la agenda, de los más recientes a los más antiguos, filtrados por nombre o teléfono."""
    clients, total = client_repository.search(
        db, text=(search or "").strip() or None, offset=(page - 1) * per_page, limit=per_page
    )
    return ClientPage(items=clients, total=total, page=page, per_page=per_page)


def update_client(db: Session, client_id: int, full_name: str, phone: str, address: str | None) -> Client:
    """Edita los datos de un cliente de la agenda. El teléfono no puede ser el de otro cliente."""
    client = client_repository.get(db, client_id)
    if client is None:
        raise NotFoundError("Cliente no encontrado")

    existing = _find_by_phone(db, phone)
    if existing is not None and existing.id != client_id:
        raise ConflictError("El número de teléfono ya está registrado por otro cliente.")

    with transaction(db):
        client.update_details(full_name, phone, address)
    db.refresh(client)
    return client
