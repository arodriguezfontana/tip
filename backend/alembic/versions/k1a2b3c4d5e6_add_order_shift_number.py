"""add order shift number

Revision ID: k1a2b3c4d5e6
Revises: j1a2b3c4d5e6
Create Date: 2026-11-11 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'k1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'j1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('numbering_shift_id', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('shift_number', sa.Integer(), nullable=True))

    # Los pedidos existentes se numeran por turno de caja, en el orden en que ingresaron. Los que no tienen turno
    # siguen la numeración del último turno abierto hasta su ingreso (0 si todavía no había ninguno).
    connection = op.get_bind()
    shifts = connection.execute(sa.text("SELECT id, opened_at FROM cash_shifts ORDER BY opened_at, id")).fetchall()
    orders = connection.execute(sa.text("SELECT id, created_at, cash_shift_id FROM orders ORDER BY id")).fetchall()
    counters: dict[int, int] = {}
    for order_id, created_at, cash_shift_id in orders:
        group = cash_shift_id
        if group is None:
            group = 0
            for shift_id, opened_at in shifts:
                if opened_at <= created_at:
                    group = shift_id
        counters[group] = counters.get(group, 0) + 1
        connection.execute(
            sa.text("UPDATE orders SET numbering_shift_id = :g, shift_number = :n WHERE id = :id"),
            {"g": group, "n": counters[group], "id": order_id},
        )

    op.alter_column('orders', 'numbering_shift_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('orders', 'shift_number', existing_type=sa.Integer(), nullable=False)
    op.create_unique_constraint(
        'uq_orders_numbering_shift_id_shift_number', 'orders', ['numbering_shift_id', 'shift_number']
    )


def downgrade() -> None:
    op.drop_constraint('uq_orders_numbering_shift_id_shift_number', 'orders', type_='unique')
    op.drop_column('orders', 'shift_number')
    op.drop_column('orders', 'numbering_shift_id')
