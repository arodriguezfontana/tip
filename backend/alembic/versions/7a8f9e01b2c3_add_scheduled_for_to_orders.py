"""add scheduled_for to orders

Revision ID: 7a8f9e01b2c3
Revises: 52a5556dc0d7
Create Date: 2026-09-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7a8f9e01b2c3'
down_revision: Union[str, Sequence[str], None] = '52a5556dc0d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'scheduled_for')
