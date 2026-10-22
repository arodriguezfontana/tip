"""add customer profile data to users and link orders to customers

Revision ID: c5d6e7f80912
Revises: b4c1d2e3f405
Create Date: 2026-09-25 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d6e7f80912'
down_revision: Union[str, Sequence[str], None] = 'b4c1d2e3f405'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('full_name', sa.String(length=150), nullable=True))
    op.add_column('users', sa.Column('phone', sa.String(length=30), nullable=True))
    op.add_column('users', sa.Column('address', sa.String(length=255), nullable=True))

    op.add_column('orders', sa.Column('customer_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_orders_customer_id'), 'orders', ['customer_id'], unique=False)
    op.create_foreign_key(
        'fk_orders_customer_id_users', 'orders', 'users', ['customer_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_orders_customer_id_users', 'orders', type_='foreignkey')
    op.drop_index(op.f('ix_orders_customer_id'), table_name='orders')
    op.drop_column('orders', 'customer_id')

    op.drop_column('users', 'address')
    op.drop_column('users', 'phone')
    op.drop_column('users', 'full_name')
