"""add modifications to order_items and extra_price to ingredients

Revision ID: c1d2e3f4a5b6
Revises: b5c6d7e8f0a1
Create Date: 2026-10-29 23:45:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b5c6d7e8f0a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('order_items', sa.Column('modifications', sa.JSON(), nullable=True))
    op.add_column(
        'ingredients',
        sa.Column('extra_price', sa.Numeric(precision=10, scale=2), server_default='0', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('ingredients', 'extra_price')
    op.drop_column('order_items', 'modifications')

