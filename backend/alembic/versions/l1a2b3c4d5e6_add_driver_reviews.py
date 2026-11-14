"""add driver reviews

Revision ID: l1a2b3c4d5e6
Revises: k1a2b3c4d5e6
Create Date: 2026-11-14 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'l1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'k1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'driver_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('delivery_driver_id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=True),
        sa.Column('comment', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('rating IS NULL OR (rating >= 1 AND rating <= 5)', name='ck_driver_reviews_rating_range'),
        sa.CheckConstraint("rating IS NOT NULL OR (comment IS NOT NULL AND comment != '')", name='ck_driver_reviews_has_content'),
        sa.ForeignKeyConstraint(['delivery_driver_id'], ['delivery_drivers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('order_id')
    )
    op.create_index(op.f('ix_driver_reviews_id'), 'driver_reviews', ['id'], unique=False)
    op.create_index(op.f('ix_driver_reviews_delivery_driver_id'), 'driver_reviews', ['delivery_driver_id'], unique=False)
    op.create_index(op.f('ix_driver_reviews_order_id'), 'driver_reviews', ['order_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_driver_reviews_order_id'), table_name='driver_reviews')
    op.drop_index(op.f('ix_driver_reviews_delivery_driver_id'), table_name='driver_reviews')
    op.drop_index(op.f('ix_driver_reviews_id'), table_name='driver_reviews')
    op.drop_table('driver_reviews')
