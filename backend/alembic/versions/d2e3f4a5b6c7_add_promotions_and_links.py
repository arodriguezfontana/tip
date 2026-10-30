"""add promotions, promotion_products, promotion_images and links

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-10-30 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tabla promotions
    op.create_table(
        'promotions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('image_url', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_promotions_id'), 'promotions', ['id'], unique=False)
    op.create_index(op.f('ix_promotions_name'), 'promotions', ['name'], unique=True)

    # 2. Tabla promotion_products
    op.create_table(
        'promotion_products',
        sa.Column('promotion_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.CheckConstraint('quantity > 0', name='ck_promotion_products_quantity'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['promotion_id'], ['promotions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('promotion_id', 'product_id'),
    )

    # 3. Tabla promotion_images
    op.create_table(
        'promotion_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('content_type', sa.String(length=20), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # 4. Links en store_configs
    op.add_column('store_configs', sa.Column('menu_link', sa.Text(), nullable=True))
    op.add_column('store_configs', sa.Column('promotions_link', sa.Text(), nullable=True))

    # 5. promotion_id en order_items y compatibilidad con product_id nullable
    op.add_column('order_items', sa.Column('promotion_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_order_items_promotion_id',
        'order_items',
        'promotions',
        ['promotion_id'],
        ['id'],
        ondelete='SET NULL',
    )
    # En SQLite alter_column no siempre puede cambiar nullable sin batch_alter_table
    with op.batch_alter_table('order_items') as batch_op:
        batch_op.alter_column('product_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('order_items') as batch_op:
        batch_op.alter_column('product_id', existing_type=sa.Integer(), nullable=False)
    op.drop_constraint('fk_order_items_promotion_id', 'order_items', type_='foreignkey')
    op.drop_column('order_items', 'promotion_id')
    op.drop_column('store_configs', 'promotions_link')
    op.drop_column('store_configs', 'menu_link')
    op.drop_table('promotion_images')
    op.drop_table('promotion_products')
    op.drop_index(op.f('ix_promotions_name'), table_name='promotions')
    op.drop_index(op.f('ix_promotions_id'), table_name='promotions')
    op.drop_table('promotions')

