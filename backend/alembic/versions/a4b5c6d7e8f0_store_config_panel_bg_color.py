"""solid color background for the admin panel

Revision ID: a4b5c6d7e8f0
Revises: f3a4b5c6d7e9
Create Date: 2026-10-29 22:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a4b5c6d7e8f0'
down_revision: Union[str, Sequence[str], None] = 'f3a4b5c6d7e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('store_configs', sa.Column('panel_bg_color', sa.String(length=7), nullable=True))


def downgrade() -> None:
    op.drop_column('store_configs', 'panel_bg_color')
