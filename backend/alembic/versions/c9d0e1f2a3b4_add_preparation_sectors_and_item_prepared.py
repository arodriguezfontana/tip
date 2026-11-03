"""add preparation sectors to categories/products and is_prepared to order_items

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-22 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('categories', sa.Column('sector', sa.String(length=50), nullable=False, server_default='cocina'))
    op.add_column('products', sa.Column('sector', sa.String(length=50), nullable=True))
    op.add_column('order_items', sa.Column('is_prepared', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.execute("UPDATE categories SET sector = 'pizzeria' WHERE LOWER(name) LIKE '%pizza%'")
    op.execute("UPDATE categories SET sector = 'barra' WHERE LOWER(name) LIKE '%bebida%'")


def downgrade() -> None:
    op.drop_column('order_items', 'is_prepared')
    op.drop_column('products', 'sector')
    op.drop_column('categories', 'sector')

