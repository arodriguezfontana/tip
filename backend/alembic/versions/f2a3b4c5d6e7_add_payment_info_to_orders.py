"""add payment method, paid flag and shipping cost to orders

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-30 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('shipping_cost', sa.Float(), server_default='0', nullable=False))
    op.add_column('orders', sa.Column('payment_method', sa.String(length=20), nullable=True))
    op.add_column('orders', sa.Column('is_paid', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_check_constraint(
        'ck_orders_payment_method', 'orders', "payment_method IN ('efectivo', 'transferencia', 'tarjeta')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_orders_payment_method', 'orders', type_='check')
    op.drop_column('orders', 'is_paid')
    op.drop_column('orders', 'payment_method')
    op.drop_column('orders', 'shipping_cost')
