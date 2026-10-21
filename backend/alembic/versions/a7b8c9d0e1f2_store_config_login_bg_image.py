"""store config: custom login background, drop free-text opening hours

Revision ID: a7b8c9d0e1f2
Revises: d1e2f3a4b5c6
Create Date: 2026-10-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('store_configs', sa.Column('login_bg_image', sa.Text(), nullable=True))
    # Los horarios se configuran solo desde la sección Horarios (tabla business_hours).
    op.drop_column('store_configs', 'opening_hours')


def downgrade() -> None:
    op.add_column('store_configs', sa.Column('opening_hours', sa.String(length=255), nullable=True))
    op.execute("UPDATE store_configs SET login_bg = 'bistro' WHERE login_bg = 'custom'")
    op.drop_column('store_configs', 'login_bg_image')
