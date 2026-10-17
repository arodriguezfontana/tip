"""add store config

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d1
Create Date: 2026-10-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'store_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_name', sa.String(length=100), nullable=False, server_default='RestoIT'),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('opening_hours', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=100), nullable=True),
        sa.Column('logo_url', sa.Text(), nullable=True),
        sa.Column('theme_color', sa.String(length=30), nullable=False, server_default='black'),
        sa.Column('login_bg', sa.String(length=50), nullable=False, server_default='bistro'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_store_configs_id'), 'store_configs', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_store_configs_id'), table_name='store_configs')
    op.drop_table('store_configs')

