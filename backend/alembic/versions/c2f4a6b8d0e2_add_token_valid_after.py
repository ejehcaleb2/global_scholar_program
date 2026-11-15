"""Add the per-user token invalidation timestamp.

Revision ID: c2f4a6b8d0e2
Revises: a7c9d2e4f1b0
"""

from alembic import op
import sqlalchemy as sa

revision = 'c2f4a6b8d0e2'
down_revision = 'a7c9d2e4f1b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('token_valid_after', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'token_valid_after')
