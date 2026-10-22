"""add order status flow and delivery_method

Revision ID: 10333dfe8e72
Revises: fa39bf91648d
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '10333dfe8e72'
down_revision: Union[str, Sequence[str], None] = 'fa39bf91648d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'orders',
        sa.Column('delivery_method', sa.String(length=20), nullable=False, server_default='domicilio'),
    )
    op.create_check_constraint(
        'ck_orders_delivery_method', 'orders', "delivery_method IN ('domicilio', 'retiro')"
    )
    op.create_check_constraint(
        'ck_orders_status',
        'orders',
        "status IN ('Pendiente', 'Confirmado', 'En Camino', 'Listo para Retirar', 'Finalizado', 'Rechazado')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_orders_status', 'orders', type_='check')
    op.drop_constraint('ck_orders_delivery_method', 'orders', type_='check')
    op.drop_column('orders', 'delivery_method')
