"""delivery_trips.total_minutes nullable (viajes despachados sin ruta calculada)

Revision ID: 9f3a7c5e1b2d
Revises: b7c8d9e0f1a2
Create Date: 2026-11-06 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '9f3a7c5e1b2d'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('delivery_trips') as batch_op:
        batch_op.alter_column('total_minutes', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute('UPDATE delivery_trips SET total_minutes = 0 WHERE total_minutes IS NULL')
    with op.batch_alter_table('delivery_trips') as batch_op:
        batch_op.alter_column('total_minutes', existing_type=sa.Integer(), nullable=False)
