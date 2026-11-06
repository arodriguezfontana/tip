"""add order_status_events and orders.estimate_source

Revision ID: a9b8c7d6e5f4
Revises: f4a5b6c7d8e9
Create Date: 2026-11-05 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a9b8c7d6e5f4'
down_revision: Union[str, Sequence[str], None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'order_status_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('queue_size', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_order_status_events_order_id'), 'order_status_events', ['order_id'], unique=False)

    with op.batch_alter_table('orders') as batch_op:
        batch_op.add_column(sa.Column('estimate_source', sa.String(length=10), nullable=True))
        batch_op.create_check_constraint(
            'ck_orders_estimate_source', "estimate_source IN ('smart', 'manual', 'default')"
        )


def downgrade() -> None:
    with op.batch_alter_table('orders') as batch_op:
        batch_op.drop_constraint('ck_orders_estimate_source', type_='check')
        batch_op.drop_column('estimate_source')
    op.drop_index(op.f('ix_order_status_events_order_id'), table_name='order_status_events')
    op.drop_table('order_status_events')
