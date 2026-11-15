"""Remove the retired per-account interface language setting."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e4f6a8b0c2d5'
down_revision = 'd3e5f7a9b1c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('profiles', 'preferred_language')
    op.execute('DROP TYPE preferred_language')


def downgrade() -> None:
    op.execute("CREATE TYPE preferred_language AS ENUM ('en', 'fr')")
    op.add_column('profiles', sa.Column(
        'preferred_language',
        postgresql.ENUM('en', 'fr', name='preferred_language', create_type=False),
        nullable=False, server_default='fr',
    ))
