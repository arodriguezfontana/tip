"""add pin security and cash pin

Revision ID: h1a2b3c4d5e6
Revises: g1a2b3c4d5e6
Create Date: 2026-11-05 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'h1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'g1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Columnas de protección de caja en store_configs
    op.add_column(
        'store_configs',
        sa.Column('cash_pin_enabled', sa.Boolean(), server_default='false', nullable=False),
    )
    op.add_column(
        'store_configs',
        sa.Column('cash_pin', sa.String(length=10), nullable=True),
    )

    # Tabla de auditoría de eventos de seguridad
    op.create_table(
        'security_audit_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('pin_type', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('ip_address', sa.String(length=100), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_security_audit_events_id'), 'security_audit_events', ['id'], unique=False)

    # Tabla de control de intentos fallidos y bloqueos temporales por PIN
    op.create_table(
        'pin_lockouts',
        sa.Column('pin_type', sa.String(length=20), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('blocked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('pin_type'),
    )


def downgrade() -> None:
    op.drop_table('pin_lockouts')
    op.drop_index(op.f('ix_security_audit_events_id'), table_name='security_audit_events')
    op.drop_table('security_audit_events')
    op.drop_column('store_configs', 'cash_pin')
    op.drop_column('store_configs', 'cash_pin_enabled')

