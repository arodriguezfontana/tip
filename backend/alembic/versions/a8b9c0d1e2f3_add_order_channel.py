"""identify the chat channel of bot orders (telegram, whatsapp)

Revision ID: a8b9c0d1e2f3
Revises: c9d0e1f2a3b4
Create Date: 2026-10-28 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('orders', 'telegram_chat_id', new_column_name='chat_id')
    op.add_column('orders', sa.Column('channel', sa.String(length=20), nullable=True))
    # Hasta ahora el bot solo atendía por Telegram. Los chat ids no numéricos son sesiones de prueba del panel.
    op.execute("UPDATE orders SET channel = 'telegram' WHERE chat_id ~ '^-?[0-9]+$'")
    op.execute("UPDATE orders SET chat_id = NULL WHERE channel IS NULL")
    op.create_check_constraint('ck_orders_channel', 'orders', "channel IN ('telegram', 'whatsapp')")


def downgrade() -> None:
    op.drop_constraint('ck_orders_channel', 'orders', type_='check')
    # Los chats de WhatsApp no existen en el esquema anterior.
    op.execute("UPDATE orders SET chat_id = NULL WHERE channel IS DISTINCT FROM 'telegram'")
    op.drop_column('orders', 'channel')
    op.alter_column('orders', 'chat_id', new_column_name='telegram_chat_id')
