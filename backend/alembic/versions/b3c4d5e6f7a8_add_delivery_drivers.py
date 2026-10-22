"""add delivery drivers

Revision ID: b3c4d5e6f7a8
Revises: f1a2b3c4d5e6
Create Date: 2026-10-16 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'delivery_drivers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('phone', sa.String(length=30), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_delivery_drivers_id'), 'delivery_drivers', ['id'], unique=False)

    op.add_column(
        'orders',
        sa.Column('delivery_driver_id', sa.Integer(), nullable=True),
    )
    op.create_index(op.f('ix_orders_delivery_driver_id'), 'orders', ['delivery_driver_id'], unique=False)
    op.create_foreign_key(
        'fk_orders_delivery_driver_id',
        'orders',
        'delivery_drivers',
        ['delivery_driver_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_orders_delivery_driver_id', 'orders', type_='foreignkey')
    op.drop_index(op.f('ix_orders_delivery_driver_id'), table_name='orders')
    op.drop_column('orders', 'delivery_driver_id')
    op.drop_index(op.f('ix_delivery_drivers_id'), table_name='delivery_drivers')
    op.drop_table('delivery_drivers')

