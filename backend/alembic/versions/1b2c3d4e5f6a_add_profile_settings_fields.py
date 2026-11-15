"""add profile avatar and preferred language fields

Revision ID: 1b2c3d4e5f6a
Revises: c8e7f6a5b4d3
Create Date: 2026-09-23 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '1b2c3d4e5f6a'
down_revision = 'c8e7f6a5b4d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE preferred_language AS ENUM ('en', 'fr')")
    op.add_column('profiles', sa.Column('avatar_url', sa.String(length=500), nullable=True))
    op.add_column(
        'profiles',
        sa.Column('preferred_language', postgresql.ENUM('en', 'fr', name='preferred_language', create_type=False), nullable=False, server_default='fr'),
    )
    op.execute("UPDATE profiles SET preferred_language = 'fr' WHERE preferred_language IS NULL")


def downgrade() -> None:
    op.drop_column('profiles', 'preferred_language')
    op.drop_column('profiles', 'avatar_url')
    op.execute("DROP TYPE IF EXISTS preferred_language")
