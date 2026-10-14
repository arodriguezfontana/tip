"""store money amounts as numeric(10, 2) instead of float

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-10-14 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c0'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (tabla, columna) de cada monto de dinero.
MONEY_COLUMNS = [
    ('products', 'price'),
    ('orders', 'total_amount'),
    ('orders', 'shipping_cost'),
    ('order_items', 'unit_price'),
]


def upgrade() -> None:
    for table, column in MONEY_COLUMNS:
        op.alter_column(
            table,
            column,
            existing_type=sa.Float(),
            type_=sa.Numeric(10, 2),
            existing_nullable=False,
            # Los valores guardados como float se redondean a centavos.
            postgresql_using=f'ROUND({column}::numeric, 2)',
        )


def downgrade() -> None:
    for table, column in MONEY_COLUMNS:
        op.alter_column(
            table,
            column,
            existing_type=sa.Numeric(10, 2),
            type_=sa.Float(),
            existing_nullable=False,
            postgresql_using=f'{column}::double precision',
        )
