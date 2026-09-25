"""add source, customer_phone and notes to orders

Revision ID: b4c1d2e3f405
Revises: 7a8f9e01b2c3
Create Date: 2026-09-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c1d2e3f405'
down_revision: Union[str, Sequence[str], None] = '7a8f9e01b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('source', sa.String(length=20), nullable=False, server_default='bot'))
    op.add_column('orders', sa.Column('customer_phone', sa.String(length=30), nullable=True))
    op.add_column('orders', sa.Column('notes', sa.Text(), nullable=True))
    op.create_check_constraint('ck_orders_source', 'orders', "source IN ('bot', 'web')")


def downgrade() -> None:
    op.drop_constraint('ck_orders_source', 'orders', type_='check')
    op.drop_column('orders', 'notes')
    op.drop_column('orders', 'customer_phone')
    op.drop_column('orders', 'source')
