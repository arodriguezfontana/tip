"""add mercadopago support

Revision ID: d1e2f3a4b5c6
Revises: b3c4d5e6f7a8
Create Date: 2026-10-16 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('store_configs', sa.Column('mp_alias', sa.String(length=100), nullable=True))
    op.add_column('orders', sa.Column('mp_preference_id', sa.String(length=100), nullable=True))
    op.add_column('orders', sa.Column('mp_payment_id', sa.String(length=100), nullable=True))
    op.drop_constraint('ck_orders_payment_method', 'orders', type_='check')
    op.create_check_constraint(
        'ck_orders_payment_method', 'orders', "payment_method IN ('efectivo', 'transferencia', 'tarjeta', 'mercadopago')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_orders_payment_method', 'orders', type_='check')
    op.create_check_constraint(
        'ck_orders_payment_method', 'orders', "payment_method IN ('efectivo', 'transferencia', 'tarjeta')"
    )
    op.drop_column('orders', 'mp_payment_id')
    op.drop_column('orders', 'mp_preference_id')
    op.drop_column('store_configs', 'mp_alias')

