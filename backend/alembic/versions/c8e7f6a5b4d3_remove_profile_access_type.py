"""remove accidental profile access type

Revision ID: c8e7f6a5b4d3
Revises: f5d9c4b4a1d2
Create Date: 2026-09-19 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c8e7f6a5b4d3'
down_revision = 'f5d9c4b4a1d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE profiles DROP COLUMN IF EXISTS access_type')


def downgrade() -> None:
    pass
