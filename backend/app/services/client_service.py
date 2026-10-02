"""Agenda de clientes del local: búsqueda por teléfono y alta/actualización al confirmar pedidos."""

import re

from sqlalchemy.orm import Session

from app.modules.client import Client


def normalize_phone(phone: str) -> str:
    """Deja solo los dígitos (y el '+' inicial) para comparar teléfonos escritos con distinto formato."""
    phone = phone.strip()
    digits = re.sub(r"\D", "", phone)
    return f"+{digits}" if phone.startswith("+") else digits


def find_client_by_phone(db: Session, phone: str) -> Client | None:
    normalized = normalize_phone(phone)
    if not normalized:
        return None
    return db.query(Client).filter(Client.phone == normalized).first()


def upsert_client(db: Session, phone: str, full_name: str, address: str | None) -> Client:
    """Registra al cliente o actualiza sus datos con los del último pedido (sin hacer commit).

    La dirección solo se pisa cuando viene informada: un pedido para retirar en el local no
    borra la dirección que ya teníamos guardada.
    """
    normalized = normalize_phone(phone)
    client = db.query(Client).filter(Client.phone == normalized).first()
    if client is None:
        client = Client(phone=normalized, full_name=full_name, address=address or None)
        db.add(client)
        return client

    client.full_name = full_name
    if address:
        client.address = address
    return client


def get_clients_paginated(
    db: Session, search: str | None = None, page: int = 1, per_page: int = 20
) -> tuple[list[Client], int]:
    """Obtiene el listado paginado de clientes, ordenados por los más recientes, con opción de búsqueda."""
    query = db.query(Client)

    if search:
        search_filter = f"%{search.strip()}%"
        query = query.filter(
            (Client.full_name.ilike(search_filter)) | (Client.phone.ilike(search_filter))
        )

    total = query.count()
    
    clients = (
        query.order_by(Client.created_at.desc(), Client.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return clients, total