"""allow 'mostrador' as order source for in-person orders

Revision ID: d7e8f9a0b1c2
Revises: c5d6e7f80912
Create Date: 2026-09-25 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd7e8f9a0b1c2'
down_revision: Union[str, Sequence[str], None] = 'c5d6e7f80912'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_orders_source', 'orders', type_='check')
    op.create_check_constraint('ck_orders_source', 'orders', "source IN ('bot', 'web', 'mostrador')")


def downgrade() -> None:
    op.execute("UPDATE orders SET source = 'web' WHERE source = 'mostrador'")
    op.drop_constraint('ck_orders_source', 'orders', type_='check')
    op.create_check_constraint('ck_orders_source', 'orders', "source IN ('bot', 'web')")
