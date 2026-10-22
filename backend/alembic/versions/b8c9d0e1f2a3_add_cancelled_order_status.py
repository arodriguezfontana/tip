"""add 'Cancelado' order status

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUSES = "'Pendiente', 'Confirmado', 'En Camino', 'Listo para Retirar', 'Finalizado', 'Rechazado'"


def upgrade() -> None:
    op.drop_constraint('ck_orders_status', 'orders', type_='check')
    op.create_check_constraint('ck_orders_status', 'orders', f"status IN ({_STATUSES}, 'Cancelado')")


def downgrade() -> None:
    op.execute("UPDATE orders SET status = 'Rechazado' WHERE status = 'Cancelado'")
    op.drop_constraint('ck_orders_status', 'orders', type_='check')
    op.create_check_constraint('ck_orders_status', 'orders', f"status IN ({_STATUSES})")
