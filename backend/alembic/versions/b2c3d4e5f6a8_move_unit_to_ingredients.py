"""move the unit of measure from recipe lines to ingredients

Revision ID: b2c3d4e5f6a8
Revises: f2a3b4c5d6e7
Create Date: 2026-10-10 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a8'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'ingredients',
        sa.Column('unit', sa.String(length=30), server_default='unidades', nullable=False),
    )
    # Cada ingrediente toma la unidad con la que figuraba en las recetas existentes.
    op.execute(
        """
        UPDATE ingredients SET unit = COALESCE(
            (SELECT pi.unit_measure FROM product_ingredients pi
             WHERE pi.ingredient_id = ingredients.id ORDER BY pi.product_id LIMIT 1),
            'unidades'
        )
        """
    )
    op.drop_column('product_ingredients', 'unit_measure')
    # Una cantidad nula o negativa no tiene sentido en una receta (y no pasaría la nueva restricción).
    op.execute("DELETE FROM product_ingredients WHERE quantity <= 0")
    op.create_check_constraint('ck_product_ingredients_quantity', 'product_ingredients', 'quantity > 0')


def downgrade() -> None:
    op.drop_constraint('ck_product_ingredients_quantity', 'product_ingredients', type_='check')
    op.add_column(
        'product_ingredients',
        sa.Column('unit_measure', sa.String(length=50), server_default='unidades', nullable=False),
    )
    op.execute(
        "UPDATE product_ingredients SET unit_measure = "
        "(SELECT i.unit FROM ingredients i WHERE i.id = product_ingredients.ingredient_id)"
    )
    op.alter_column('product_ingredients', 'unit_measure', server_default=None)
    op.drop_column('ingredients', 'unit')
