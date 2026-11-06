"""add business goals and ingredient cost

Revision ID: i1a2b3c4d5e6
Revises: h1a2b3c4d5e6
Create Date: 2026-11-05 23:15:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'i1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'h1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Agregar columna cost en ingredients
    op.add_column(
        'ingredients',
        sa.Column('cost', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    )

    # Crear tabla de business_goals
    op.create_table(
        'business_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('period_type', sa.String(length=20), nullable=False),
        sa.Column('target_revenue', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
        sa.Column('target_orders', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('period_type', name='uq_business_goals_period_type'),
    )
    op.create_index(op.f('ix_business_goals_id'), 'business_goals', ['id'], unique=False)
    op.create_index(op.f('ix_business_goals_period_type'), 'business_goals', ['period_type'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_business_goals_period_type'), table_name='business_goals')
    op.drop_index(op.f('ix_business_goals_id'), table_name='business_goals')
    op.drop_table('business_goals')
    op.drop_column('ingredients', 'cost')

