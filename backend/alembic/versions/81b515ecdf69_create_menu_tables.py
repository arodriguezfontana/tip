"""create menu tables

Revision ID: 81b515ecdf69
Revises: 3cfdfa26a44a
Create Date: 2026-08-28 16:50:22.946932

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81b515ecdf69'
down_revision: Union[str, Sequence[str], None] = '3cfdfa26a44a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
