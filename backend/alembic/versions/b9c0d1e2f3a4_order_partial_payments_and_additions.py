"""partial payments and items added after the order was registered

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-10-28 16:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('paid_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('orders', sa.Column('balance_payment_method', sa.String(length=20), nullable=True))
    op.add_column(
        'orders', sa.Column('kitchen_update_pending', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column('order_items', sa.Column('added_later', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_check_constraint(
        'ck_orders_balance_payment_method',
        'orders',
        "balance_payment_method IN ('efectivo', 'transferencia', 'tarjeta', 'mercadopago')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_orders_balance_payment_method', 'orders', type_='check')
    op.drop_column('order_items', 'added_later')
    op.drop_column('orders', 'kitchen_update_pending')
    op.drop_column('orders', 'balance_payment_method')
    op.drop_column('orders', 'paid_amount')
