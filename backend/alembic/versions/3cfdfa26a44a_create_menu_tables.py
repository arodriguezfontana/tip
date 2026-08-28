"""create menu tables

Revision ID: 3cfdfa26a44a
Revises: 330f6ed74af3
Create Date: 2026-08-28 16:48:42.538382

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3cfdfa26a44a'
down_revision: Union[str, Sequence[str], None] = '330f6ed74af3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
