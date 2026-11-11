"""add printers

Revision ID: j1a2b3c4d5e6
Revises: 9e5047d898cb
Create Date: 2026-11-10 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'j1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = '9e5047d898cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'printers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sector', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('host', sa.String(length=255), nullable=False),
        sa.Column('port', sa.Integer(), server_default='9100', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sector'),
    )
    op.create_index(op.f('ix_printers_id'), 'printers', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_printers_id'), table_name='printers')
    op.drop_table('printers')
