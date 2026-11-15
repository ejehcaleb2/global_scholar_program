"""add course builder fields for Batch 3

Revision ID: b3e8a4f21c6d
Revises: 1b2c3d4e5f6a
Create Date: 2026-10-17 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = 'b3e8a4f21c6d'
down_revision = '1b2c3d4e5f6a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('courses', sa.Column('summary', sa.String(length=200), nullable=True))
    op.add_column('courses', sa.Column('thumbnail_url', sa.String(length=500), nullable=True))
    op.add_column(
        'courses',
        sa.Column('learning_outcomes', sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
    )
    op.add_column('courses', sa.Column('structure_revision', sa.Integer(), server_default='1', nullable=False))
    op.add_column('lessons', sa.Column('duration_minutes', sa.Integer(), server_default='0', nullable=False))
    op.create_index('ix_courses_updated_at', 'courses', ['updated_at'])
    op.create_index('ix_courses_access_type', 'courses', ['access_type'])


def downgrade() -> None:
    op.drop_index('ix_courses_access_type', table_name='courses')
    op.drop_index('ix_courses_updated_at', table_name='courses')
    op.drop_column('lessons', 'duration_minutes')
    op.drop_column('courses', 'structure_revision')
    op.drop_column('courses', 'learning_outcomes')
    op.drop_column('courses', 'thumbnail_url')
    op.drop_column('courses', 'summary')