"""add business hours

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-10-10 12:00:00.000000

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
        'business_hours',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('opens_at', sa.Time(), nullable=False),
        sa.Column('closes_at', sa.Time(), nullable=False),
        sa.CheckConstraint('day_of_week BETWEEN 0 AND 6', name='ck_business_hours_day_of_week'),
        sa.CheckConstraint('opens_at <> closes_at', name='ck_business_hours_range'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_business_hours_id'), 'business_hours', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_business_hours_id'), table_name='business_hours')
    op.drop_table('business_hours')
