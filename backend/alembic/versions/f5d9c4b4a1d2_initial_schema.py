"""initial schema

Revision ID: f5d9c4b4a1d2
Revises:
Create Date: 2026-09-19 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f5d9c4b4a1d2'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE user_role AS ENUM ('student', 'admin')")
    op.execute("CREATE TYPE education_level AS ENUM ('high_school', 'undergraduate', 'graduate', 'other')")
    op.execute("CREATE TYPE access_type AS ENUM ('free', 'members_only')")
    op.execute("CREATE TYPE course_status AS ENUM ('draft', 'published')")
    op.execute("CREATE TYPE subscription_plan AS ENUM ('beta', 'monthly', 'annual')")
    op.execute("CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'canceled')")
    op.execute("CREATE TYPE consent_type AS ENUM ('tos', 'privacy', 'case_study')")
    op.execute("CREATE TYPE service_type AS ENUM ('essay_review', 'activities_review')")
    op.execute("CREATE TYPE service_status AS ENUM ('submitted', 'in_progress', 'returned')")
    op.execute("CREATE TYPE homepage_post_status AS ENUM ('draft', 'published')")
    op.execute("CREATE TYPE resource_status AS ENUM ('draft', 'published')")

    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role', postgresql.ENUM('student', 'admin', name='user_role', create_type=False), nullable=False, server_default='student'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('email', name='uq_users_email'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    op.create_table(
        'profiles',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('date_of_birth', sa.Date(), nullable=True),
        sa.Column('country', sa.String(length=255), nullable=True),
        sa.Column('education_level', postgresql.ENUM('high_school', 'undergraduate', 'graduate', 'other', name='education_level', create_type=False), nullable=True),
        sa.Column('school', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=255), nullable=True),
        sa.Column('what_brings_you', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('fields_of_study', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('countries_of_interest', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_profiles_user_id_users', ondelete='CASCADE'),
    )

    op.create_table(
        'subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('plan', postgresql.ENUM('beta', 'monthly', 'annual', name='subscription_plan', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM('active', 'expired', 'canceled', name='subscription_status', create_type=False), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_subscriptions_user_id_users', ondelete='CASCADE'),
    )
    op.create_index('ix_subscriptions_user_id', 'subscriptions', ['user_id'])

    op.create_table(
        'consents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('consent_type', postgresql.ENUM('tos', 'privacy', 'case_study', name='consent_type', create_type=False), nullable=False),
        sa.Column('version', sa.String(length=50), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_consents_user_id_users', ondelete='CASCADE'),
    )
    op.create_index('ix_consents_user_id', 'consents', ['user_id'])

    op.create_table(
        'courses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('access_type', postgresql.ENUM('free', 'members_only', name='access_type', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM('draft', 'published', name='course_status', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_courses_status', 'courses', ['status'])

    op.create_table(
        'modules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('course_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], name='fk_modules_course_id_courses', ondelete='CASCADE'),
    )
    op.create_index('ix_modules_course_id', 'modules', ['course_id'])

    op.create_table(
        'lessons',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('module_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('try_it_yourself_prompt', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['module_id'], ['modules.id'], name='fk_lessons_module_id_modules', ondelete='CASCADE'),
    )
    op.create_index('ix_lessons_module_id', 'lessons', ['module_id'])

    op.create_table(
        'lesson_progress',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lesson_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_lesson_progress_user_id_users', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], name='fk_lesson_progress_lesson_id_lessons', ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'lesson_id', name='uq_lesson_progress_user_lesson'),
    )
    op.create_index('ix_lesson_progress_user_id', 'lesson_progress', ['user_id'])
    op.create_index('ix_lesson_progress_lesson_id', 'lesson_progress', ['lesson_id'])

    op.create_table(
        'course_progress',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('course_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('completed_count', sa.Integer(), nullable=False),
        sa.Column('total_count', sa.Integer(), nullable=False),
        sa.Column('percent', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_course_progress_user_id_users', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], name='fk_course_progress_course_id_courses', ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'course_id', name='uq_course_progress_user_course'),
    )
    op.create_index('ix_course_progress_user_id', 'course_progress', ['user_id'])
    op.create_index('ix_course_progress_course_id', 'course_progress', ['course_id'])

    op.create_table(
        'resources',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('access_type', postgresql.ENUM('free', 'members_only', name='access_type', create_type=False), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=True),
        sa.Column('status', postgresql.ENUM('draft', 'published', name='resource_status', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_resources_category', 'resources', ['category'])
    op.create_index('ix_resources_status', 'resources', ['status'])

    op.create_table(
        'opportunities',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('external_link', sa.String(length=500), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_opportunities_created_by_users'),
    )
    op.create_index('ix_opportunities_deadline', 'opportunities', ['deadline'])
    op.create_index('ix_opportunities_category', 'opportunities', ['category'])
    op.create_index('ix_opportunities_created_by', 'opportunities', ['created_by'])

    op.create_table(
        'masterclasses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('speaker_name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('session_datetime', sa.DateTime(timezone=True), nullable=False),
        sa.Column('session_link', sa.String(length=500), nullable=False),
        sa.Column('access_type', postgresql.ENUM('free', 'members_only', name='access_type', create_type=False), nullable=False),
        sa.Column('recording_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_masterclasses_session_datetime', 'masterclasses', ['session_datetime'])

    op.create_table(
        'homepage_posts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('thumbnail_url', sa.String(length=500), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('body_html', sa.Text(), nullable=False),
        sa.Column('status', postgresql.ENUM('draft', 'published', name='homepage_post_status', create_type=False), nullable=False),
        sa.Column('pinned', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('pin_order', sa.Integer(), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_homepage_posts_status', 'homepage_posts', ['status'])
    op.create_index('ix_homepage_posts_pinned', 'homepage_posts', ['pinned'])

    op.create_table(
        'service_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('service_type', postgresql.ENUM('essay_review', 'activities_review', name='service_type', create_type=False), nullable=False),
        sa.Column('document_url', sa.String(length=500), nullable=True),
        sa.Column('status', postgresql.ENUM('submitted', 'in_progress', 'returned', name='service_status', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_service_requests_user_id_users', ondelete='CASCADE'),
    )
    op.create_index('ix_service_requests_user_id', 'service_requests', ['user_id'])
    op.create_index('ix_service_requests_status', 'service_requests', ['status'])

    op.create_table(
        'service_request_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('service_request_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('from_status', postgresql.ENUM('submitted', 'in_progress', 'returned', name='service_status', create_type=False), nullable=True),
        sa.Column('to_status', postgresql.ENUM('submitted', 'in_progress', 'returned', name='service_status', create_type=False), nullable=False),
        sa.Column('changed_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['service_request_id'], ['service_requests.id'], name='fk_service_request_events_service_request_id_service_requests', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id'], name='fk_service_request_events_changed_by_users', ondelete='RESTRICT'),
    )
    op.create_index('ix_service_request_events_service_request_id', 'service_request_events', ['service_request_id'])
    op.create_index('ix_service_request_events_changed_by', 'service_request_events', ['changed_by'])

    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=100), nullable=False),
        sa.Column('entity_id', sa.String(length=255), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name='fk_audit_logs_actor_id_users', ondelete='RESTRICT'),
    )
    op.create_index('ix_audit_logs_actor_id', 'audit_logs', ['actor_id'])
    op.create_index('ix_audit_logs_entity_type', 'audit_logs', ['entity_type'])
    op.create_index('ix_audit_logs_entity_id', 'audit_logs', ['entity_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_entity_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_entity_type', table_name='audit_logs')
    op.drop_index('ix_audit_logs_actor_id', table_name='audit_logs')
    op.drop_table('audit_logs')

    op.drop_index('ix_service_request_events_changed_by', table_name='service_request_events')
    op.drop_index('ix_service_request_events_service_request_id', table_name='service_request_events')
    op.drop_table('service_request_events')

    op.drop_index('ix_service_requests_status', table_name='service_requests')
    op.drop_index('ix_service_requests_user_id', table_name='service_requests')
    op.drop_table('service_requests')

    op.drop_index('ix_homepage_posts_pinned', table_name='homepage_posts')
    op.drop_index('ix_homepage_posts_status', table_name='homepage_posts')
    op.drop_table('homepage_posts')

    op.drop_index('ix_masterclasses_session_datetime', table_name='masterclasses')
    op.drop_table('masterclasses')

    op.drop_index('ix_opportunities_created_by', table_name='opportunities')
    op.drop_index('ix_opportunities_category', table_name='opportunities')
    op.drop_index('ix_opportunities_deadline', table_name='opportunities')
    op.drop_table('opportunities')

    op.drop_index('ix_resources_status', table_name='resources')
    op.drop_index('ix_resources_category', table_name='resources')
    op.drop_table('resources')

    op.drop_index('ix_course_progress_course_id', table_name='course_progress')
    op.drop_index('ix_course_progress_user_id', table_name='course_progress')
    op.drop_table('course_progress')

    op.drop_index('ix_lesson_progress_lesson_id', table_name='lesson_progress')
    op.drop_index('ix_lesson_progress_user_id', table_name='lesson_progress')
    op.drop_table('lesson_progress')

    op.drop_index('ix_lessons_module_id', table_name='lessons')
    op.drop_table('lessons')

    op.drop_index('ix_modules_course_id', table_name='modules')
    op.drop_table('modules')

    op.drop_index('ix_courses_status', table_name='courses')
    op.drop_table('courses')

    op.drop_index('ix_consents_user_id', table_name='consents')
    op.drop_table('consents')

    op.drop_index('ix_subscriptions_user_id', table_name='subscriptions')
    op.drop_table('subscriptions')

    op.drop_table('profiles')

    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')

    op.execute('DROP TYPE IF EXISTS resource_status')
    op.execute('DROP TYPE IF EXISTS homepage_post_status')
    op.execute('DROP TYPE IF EXISTS service_status')
    op.execute('DROP TYPE IF EXISTS service_type')
    op.execute('DROP TYPE IF EXISTS consent_type')
    op.execute('DROP TYPE IF EXISTS subscription_status')
    op.execute('DROP TYPE IF EXISTS subscription_plan')
    op.execute('DROP TYPE IF EXISTS course_status')
    op.execute('DROP TYPE IF EXISTS access_type')
    op.execute('DROP TYPE IF EXISTS education_level')
    op.execute('DROP TYPE IF EXISTS user_role')
