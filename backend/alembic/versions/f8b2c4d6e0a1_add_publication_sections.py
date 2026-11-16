"""Add ordered multimedia sections without changing existing publications."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f8b2c4d6e0a1'
down_revision = 'e4f6a8b0c2d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('homepage_posts', sa.Column('sections', postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))


def downgrade() -> None:
    op.drop_column('homepage_posts', 'sections')
