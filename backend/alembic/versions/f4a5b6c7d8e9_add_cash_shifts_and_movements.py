"""add cash_shifts and cash_movements

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-10-30 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabla cash_shifts
    op.create_table(
        'cash_shifts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('initial_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('final_amount', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('expected_amount', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('difference', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='abierta', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('opened_by_id', sa.Integer(), nullable=True),
        sa.Column('closed_by_id', sa.Integer(), nullable=True),
        sa.CheckConstraint("status IN ('abierta', 'cerrada')", name='ck_cash_shifts_status'),
        sa.ForeignKeyConstraint(['closed_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['opened_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cash_shifts_id'), 'cash_shifts', ['id'], unique=False)
    op.create_index(op.f('ix_cash_shifts_status'), 'cash_shifts', ['status'], unique=False)

    # 2. Tabla cash_movements
    op.create_table(
        'cash_movements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cash_shift_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.CheckConstraint('amount > 0', name='ck_cash_movements_amount'),
        sa.CheckConstraint("type IN ('ingreso', 'egreso')", name='ck_cash_movements_type'),
        sa.ForeignKeyConstraint(['cash_shift_id'], ['cash_shifts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cash_movements_cash_shift_id'), 'cash_movements', ['cash_shift_id'], unique=False)
    op.create_index(op.f('ix_cash_movements_id'), 'cash_movements', ['id'], unique=False)

    # 3. Columna cash_shift_id en orders
    op.add_column('orders', sa.Column('cash_shift_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_orders_cash_shift_id'), 'orders', ['cash_shift_id'], unique=False)
    op.create_foreign_key(
        'fk_orders_cash_shift_id',
        'orders',
        'cash_shifts',
        ['cash_shift_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_orders_cash_shift_id', 'orders', type_='foreignkey')
    op.drop_index(op.f('ix_orders_cash_shift_id'), table_name='orders')
    op.drop_column('orders', 'cash_shift_id')
    op.drop_index(op.f('ix_cash_movements_id'), table_name='cash_movements')
    op.drop_index(op.f('ix_cash_movements_cash_shift_id'), table_name='cash_movements')
    op.drop_table('cash_movements')
    op.drop_index(op.f('ix_cash_shifts_status'), table_name='cash_shifts')
    op.drop_index(op.f('ix_cash_shifts_id'), table_name='cash_shifts')
    op.drop_table('cash_shifts')

