"""add delivery_trips and order trip fields

Revision ID: b7c8d9e0f1a2
Revises: a9b8c7d6e5f4
Create Date: 2026-11-06 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a9b8c7d6e5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'delivery_trips',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('delivery_driver_id', sa.Integer(), nullable=True),
        sa.Column('dispatched_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('total_minutes', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['delivery_driver_id'], ['delivery_drivers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_delivery_trips_id'), 'delivery_trips', ['id'], unique=False)
    op.create_index(op.f('ix_delivery_trips_delivery_driver_id'), 'delivery_trips', ['delivery_driver_id'], unique=False)

    with op.batch_alter_table('orders') as batch_op:
        batch_op.add_column(sa.Column('trip_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('trip_stop', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('eta_minutes', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_orders_trip_id'), ['trip_id'], unique=False)
        batch_op.create_foreign_key('fk_orders_trip_id', 'delivery_trips', ['trip_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('orders') as batch_op:
        batch_op.drop_constraint('fk_orders_trip_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_orders_trip_id'))
        batch_op.drop_column('eta_minutes')
        batch_op.drop_column('trip_stop')
        batch_op.drop_column('trip_id')
    op.drop_index(op.f('ix_delivery_trips_delivery_driver_id'), table_name='delivery_trips')
    op.drop_index(op.f('ix_delivery_trips_id'), table_name='delivery_trips')
    op.drop_table('delivery_trips')
