"""add hero_slides

Revision ID: e6a1b2c3d4f5
Revises: d4e9c0a17b32
Create Date: 2026-10-20 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = 'e6a1b2c3d4f5'
down_revision = 'd4e9c0a17b32'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'hero_slides',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('position', sa.SmallInteger(), nullable=False),
        sa.Column('image_key', sa.String(length=64), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('alt_en', sa.String(length=160), nullable=False),
        sa.Column('alt_fr', sa.String(length=160), nullable=False),
        sa.Column('caption_en', sa.String(length=120), nullable=True),
        sa.Column('caption_fr', sa.String(length=120), nullable=True),
        sa.Column('focal_x', sa.SmallInteger(), nullable=False, server_default='50'),
        sa.Column('focal_y', sa.SmallInteger(), nullable=False, server_default='50'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('position', name='uq_hero_slides_position', deferrable=True, initially='DEFERRED'),
        sa.CheckConstraint('position between 1 and 5', name='ck_hero_slides_position'),
        sa.CheckConstraint('focal_x between 0 and 100 and focal_y between 0 and 100', name='ck_hero_slides_focal'),
    )


def downgrade() -> None:
    op.drop_table('hero_slides')
