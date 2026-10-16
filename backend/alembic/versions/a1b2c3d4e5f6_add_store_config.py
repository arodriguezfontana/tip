"""add store config table for web customization

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-10-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'store_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('store_name', sa.String(length=100), server_default='RestoIT', nullable=False),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('opening_hours', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=100), nullable=True),
        sa.Column('logo_url', sa.Text(), nullable=True),
        sa.Column('theme_color', sa.String(length=30), server_default='black', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_store_configs_id'), 'store_configs', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_store_configs_id'), table_name='store_configs')
    op.drop_table('store_configs')

