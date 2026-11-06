"""add orders.actual_minutes (demora real) y completar la de los pedidos ya finalizados

Revision ID: 4d7e9a1c3b5f
Revises: 9f3a7c5e1b2d
Create Date: 2026-11-06 20:00:00.000000

"""
from datetime import timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '4d7e9a1c3b5f'
down_revision: Union[str, Sequence[str], None] = '9f3a7c5e1b2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('orders') as batch_op:
        batch_op.add_column(sa.Column('actual_minutes', sa.Integer(), nullable=True))

    # Los pedidos que ya estaban finalizados: desde que ingresaron hasta el momento en que se finalizaron.
    orders = sa.table(
        'orders',
        sa.column('id', sa.Integer),
        sa.column('status', sa.String),
        sa.column('created_at', sa.DateTime(timezone=True)),
        sa.column('actual_minutes', sa.Integer),
    )
    events = sa.table(
        'order_status_events',
        sa.column('order_id', sa.Integer),
        sa.column('status', sa.String),
        sa.column('occurred_at', sa.DateTime(timezone=True)),
    )
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(orders.c.id, orders.c.created_at, sa.func.max(events.c.occurred_at))
        .select_from(orders.join(events, events.c.order_id == orders.c.id))
        .where(orders.c.status == 'Finalizado', events.c.status == 'Finalizado')
        .group_by(orders.c.id, orders.c.created_at)
    ).fetchall()
    for order_id, created_at, finished_at in rows:
        if created_at is None or finished_at is None:
            continue
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if finished_at.tzinfo is None:
            finished_at = finished_at.replace(tzinfo=timezone.utc)
        minutes = max(0, round((finished_at - created_at).total_seconds() / 60))
        bind.execute(orders.update().where(orders.c.id == order_id).values(actual_minutes=minutes))


def downgrade() -> None:
    with op.batch_alter_table('orders') as batch_op:
        batch_op.drop_column('actual_minutes')
