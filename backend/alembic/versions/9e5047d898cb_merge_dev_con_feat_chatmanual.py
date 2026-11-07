"""merge dev con feat/ChatManual

Revision ID: 9e5047d898cb
Revises: 4d7e9a1c3b5f, i1a2b3c4d5e6
Create Date: 2026-11-06 14:23:05.578895

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e5047d898cb'
down_revision: Union[str, Sequence[str], None] = ('4d7e9a1c3b5f', 'i1a2b3c4d5e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
