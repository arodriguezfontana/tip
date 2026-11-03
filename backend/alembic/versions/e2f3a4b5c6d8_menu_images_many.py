"""the menu can be made of several images

Revision ID: e2f3a4b5c6d8
Revises: d1e2f3a4b5c7
Create Date: 2026-10-29 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'e2f3a4b5c6d8'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('menu_images', sa.Column('position', sa.Integer(), nullable=False, server_default='0'))
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        # La imagen que había se guardó con id 1 a mano: la secuencia hay que adelantarla para que las nuevas no choquen.
        bind.execute(sa.text(
            "SELECT setval(pg_get_serial_sequence('menu_images', 'id'), COALESCE((SELECT MAX(id) FROM menu_images), 0) + 1, false)"
        ))


def downgrade() -> None:
    # Una sola imagen vigente: se conserva la primera.
    op.execute(
        "DELETE FROM menu_images WHERE id NOT IN "
        "(SELECT id FROM (SELECT id FROM menu_images ORDER BY position, id LIMIT 1) AS primera)"
    )
    op.drop_column('menu_images', 'position')
