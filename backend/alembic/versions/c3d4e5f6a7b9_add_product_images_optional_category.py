"""add product images and allow products without category

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b9'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_images',
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('content_type', sa.String(length=20), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('product_id'),
    )
    op.alter_column('products', 'category_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Volver a exigir categoría: los productos que quedaron sin una pasan a "Sin categoría".
    op.execute(
        "INSERT INTO categories (name) SELECT 'Sin categoría' "
        "WHERE EXISTS (SELECT 1 FROM products WHERE category_id IS NULL) "
        "AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Sin categoría')"
    )
    op.execute(
        "UPDATE products SET category_id = (SELECT id FROM categories WHERE name = 'Sin categoría') "
        "WHERE category_id IS NULL"
    )
    op.alter_column('products', 'category_id', existing_type=sa.Integer(), nullable=False)
    op.drop_table('product_images')
