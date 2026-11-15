"""add lesson media fields and version snapshots

Revision ID: d4e9c0a17b32
Revises: b3e8a4f21c6d
Create Date: 2026-10-18 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = 'd4e9c0a17b32'
down_revision = 'b3e8a4f21c6d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('lessons', sa.Column('video_provider', sa.String(length=16), nullable=True))
    op.add_column('lessons', sa.Column('video_id', sa.String(length=64), nullable=True))
    op.add_column(
        'lessons',
        sa.Column('resources', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    )
    op.create_check_constraint(
        'ck_lessons_video_provider', 'lessons', "video_provider IS NULL OR video_provider IN ('youtube', 'vimeo')"
    )
    op.create_check_constraint('ck_lessons_video_pair', 'lessons', '(video_provider IS NULL) = (video_id IS NULL)')
    op.create_table(
        'lesson_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lesson_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version_no', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('try_it_yourself_prompt', sa.Text(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('video_provider', sa.String(length=16), nullable=True),
        sa.Column('video_id', sa.String(length=64), nullable=True),
        sa.Column('resources', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('note', sa.String(length=120), nullable=True),
        sa.Column('saved_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('saved_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['saved_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('lesson_id', 'version_no', name='uq_lesson_versions_lesson_version'),
    )
    op.create_index(
        'ix_lesson_versions_lesson_saved_at',
        'lesson_versions',
        ['lesson_id', sa.text('saved_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_lesson_versions_lesson_saved_at', table_name='lesson_versions')
    op.drop_table('lesson_versions')
    op.drop_constraint('ck_lessons_video_pair', 'lessons', type_='check')
    op.drop_constraint('ck_lessons_video_provider', 'lessons', type_='check')
    op.drop_column('lessons', 'resources')
    op.drop_column('lessons', 'video_id')
    op.drop_column('lessons', 'video_provider')