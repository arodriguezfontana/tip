"""add clients directory for counter orders autocomplete

Revision ID: e1f2a3b4c5d6
Revises: d7e8f9a0b1c2
Create Date: 2026-09-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'clients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('phone', sa.String(length=30), nullable=False),
        sa.Column('full_name', sa.String(length=150), nullable=False),
        sa.Column('address', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_clients_id'), 'clients', ['id'], unique=False)
    op.create_index(op.f('ix_clients_phone'), 'clients', ['phone'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_clients_phone'), table_name='clients')
    op.drop_index(op.f('ix_clients_id'), table_name='clients')
    op.drop_table('clients')
