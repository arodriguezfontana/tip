"""add telegram_chat_id and estimated_minutes to orders

Revision ID: 52a5556dc0d7
Revises: 10333dfe8e72
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '52a5556dc0d7'
down_revision: Union[str, Sequence[str], None] = '10333dfe8e72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('telegram_chat_id', sa.String(length=32), nullable=True))
    op.add_column('orders', sa.Column('estimated_minutes', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'estimated_minutes')
    op.drop_column('orders', 'telegram_chat_id')
