"""create menu tables

Revision ID: 04b39c0d3c44
Revises: 81b515ecdf69
Create Date: 2026-08-28 16:51:13.593723

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '04b39c0d3c44'
down_revision: Union[str, Sequence[str], None] = '81b515ecdf69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
