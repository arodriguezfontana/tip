"""background image for the admin panel

Revision ID: f3a4b5c6d7e9
Revises: e2f3a4b5c6d8
Create Date: 2026-10-29 20:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'f3a4b5c6d7e9'
down_revision: Union[str, Sequence[str], None] = 'e2f3a4b5c6d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('store_configs', sa.Column('panel_bg', sa.String(length=50), nullable=False, server_default='none'))
    op.add_column('store_configs', sa.Column('panel_bg_image', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('store_configs', 'panel_bg_image')
    op.drop_column('store_configs', 'panel_bg')
