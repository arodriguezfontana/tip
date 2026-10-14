"""merge the business hours branch with the catalog (ingredients, images, money) branch

Las dos ramas partieron de f2a3b4c5d6e7: los horarios de atención (a1b2c3d4e5f6, de feat/horario-local) y
el catálogo (b2c3d4e5f6a8 -> c3d4e5f6a7b9 -> d4e5f6a7b8c0). Como tocan tablas distintas no hace falta
cambiar nada: esta migración solo las vuelve a unir en una única cabeza, así cualquier base (con una u
otra rama aplicada) llega al mismo esquema con `alembic upgrade head`.

Revision ID: e5f6a7b8c9d1
Revises: a1b2c3d4e5f6, d4e5f6a7b8c0
Create Date: 2026-10-14 20:00:00.000000

"""
from typing import Sequence, Union


revision: str = 'e5f6a7b8c9d1'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4e5f6', 'd4e5f6a7b8c0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
