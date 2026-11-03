"""normalize phone numbers to the single format (national, without 54 nor the mobile 9)

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-10-29 10:00:00.000000

"""
import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'c0d1e2f3a4b5'
down_revision: Union[str, Sequence[str], None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NATIONAL_LENGTH = 10


def _argentine_national(digits: str):
    # Copia de app.core.phone: una migración no debe depender del código de la app, que puede cambiar.
    if digits.startswith("549") and len(digits) == _NATIONAL_LENGTH + 3:
        return digits[3:]
    if digits.startswith("54") and len(digits) == _NATIONAL_LENGTH + 2:
        return digits[2:]
    if len(digits) == _NATIONAL_LENGTH + 1 and digits[0] in "09":
        return digits[1:]
    without_zero = digits[1:] if digits.startswith("0") else digits
    if len(without_zero) == _NATIONAL_LENGTH + 2:
        for position in (2, 3, 4):
            if without_zero[position:position + 2] == "15":
                return without_zero[:position] + without_zero[position + 2:]
    if len(digits) == _NATIONAL_LENGTH:
        return digits
    return None


def _normalize(phone):
    text = (phone or "").strip()
    digits = re.sub(r"\D", "", text)
    if not digits:
        return ""
    return _argentine_national(digits) or (f"+{digits}" if text.startswith("+") else digits)


def upgrade() -> None:
    conn = op.get_bind()

    # Agenda de clientes: el teléfono es único, así que los que quedan iguales una vez normalizados se unen en
    # uno solo (el más recientemente actualizado, que conserva la dirección de otro si él no tenía).
    clients = conn.execute(
        sa.text("SELECT id, phone, address FROM clients ORDER BY updated_at DESC, id DESC")
    ).fetchall()
    kept = {}
    for client in clients:
        normalized = _normalize(client.phone)
        if not normalized:
            continue
        if normalized not in kept:
            kept[normalized] = {"id": client.id, "phone": client.phone, "address": client.address}
            continue
        keeper = kept[normalized]
        if not keeper["address"] and client.address:
            keeper["address"] = client.address
            conn.execute(sa.text("UPDATE clients SET address = :a WHERE id = :i"), {"a": client.address, "i": keeper["id"]})
        conn.execute(sa.text("DELETE FROM clients WHERE id = :i"), {"i": client.id})
    for normalized, keeper in kept.items():
        if keeper["phone"] != normalized:
            conn.execute(sa.text("UPDATE clients SET phone = :p WHERE id = :i"), {"p": normalized, "i": keeper["id"]})

    # Pedidos: solo se reescribe el formato del teléfono (no es único).
    orders = conn.execute(
        sa.text("SELECT id, customer_phone FROM orders WHERE customer_phone IS NOT NULL")
    ).fetchall()
    for order in orders:
        normalized = _normalize(order.customer_phone)
        if normalized and normalized != order.customer_phone:
            conn.execute(sa.text("UPDATE orders SET customer_phone = :p WHERE id = :i"), {"p": normalized, "i": order.id})


def downgrade() -> None:
    # El formato original de cada teléfono no se conserva: no hay forma de volver atrás.
    pass
