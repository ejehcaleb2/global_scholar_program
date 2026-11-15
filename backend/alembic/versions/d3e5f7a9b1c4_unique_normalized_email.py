"""Enforce case-insensitive user email uniqueness.

Revision ID: d3e5f7a9b1c4
Revises: c2f4a6b8d0e2
"""
from alembic import op
import sqlalchemy as sa

revision = 'd3e5f7a9b1c4'
down_revision = 'c2f4a6b8d0e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('uq_users_email_lower', 'users', [sa.text('lower(email)')], unique=True)


def downgrade() -> None:
    op.drop_index('uq_users_email_lower', table_name='users')
