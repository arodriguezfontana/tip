"""add secondary_product_id and custom_name to order_items for half and half pizzas

Revision ID: b5c6d7e8f0a1
Revises: a4b5c6d7e8f0
Create Date: 2026-10-29 23:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b5c6d7e8f0a1'
down_revision: Union[str, Sequence[str], None] = 'a4b5c6d7e8f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('order_items', sa.Column('secondary_product_id', sa.Integer(), nullable=True))
    op.add_column('order_items', sa.Column('custom_name', sa.String(length=255), nullable=True))
    op.create_foreign_key(
        'fk_order_items_secondary_product_id',
        'order_items',
        'products',
        ['secondary_product_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_order_items_secondary_product_id', 'order_items', type_='foreignkey')
    op.drop_column('order_items', 'custom_name')
    op.drop_column('order_items', 'secondary_product_id')

