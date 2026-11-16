from __future__ import annotations

import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import ARRAY, JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    student = 'student'
    admin = 'admin'


class EducationLevel(str, enum.Enum):
    high_school = 'high_school'
    undergraduate = 'undergraduate'
    graduate = 'graduate'
    other = 'other'


class AccessType(str, enum.Enum):
    free = 'free'
    members_only = 'members_only'


class CourseStatus(str, enum.Enum):
    draft = 'draft'
    published = 'published'


class SubscriptionPlan(str, enum.Enum):
    beta = 'beta'
    monthly = 'monthly'
    annual = 'annual'


class SubscriptionStatus(str, enum.Enum):
    active = 'active'
    expired = 'expired'
    canceled = 'canceled'


class ConsentType(str, enum.Enum):
    tos = 'tos'
    privacy = 'privacy'
    case_study = 'case_study'


class ServiceType(str, enum.Enum):
    essay_review = 'essay_review'
    activities_review = 'activities_review'


class ServiceStatus(str, enum.Enum):
    submitted = 'submitted'
    in_progress = 'in_progress'
    returned = 'returned'


class HomepageStatus(str, enum.Enum):
    draft = 'draft'
    published = 'published'


class ResourceStatus(str, enum.Enum):
    draft = 'draft'
    published = 'published'


class User(Base):
    __tablename__ = 'users'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    __table_args__ = (
        sa.UniqueConstraint('email', name='uq_users_email'),
        Index('uq_users_email_lower', sa.func.lower(email), unique=True),
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        sa.Enum(UserRole, name='user_role', create_type=True),
        nullable=False,
        default=UserRole.student,
        server_default='student',
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    token_valid_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    profile: Mapped['Profile'] = relationship(back_populates='user', uselist=False, cascade='all, delete-orphan', passive_deletes=True)
    subscriptions: Mapped[list['Subscription']] = relationship(back_populates='user', cascade='all, delete-orphan', passive_deletes=True)
    consents: Mapped[list['Consent']] = relationship(back_populates='user', cascade='all, delete-orphan', passive_deletes=True)
    lesson_progress: Mapped[list['LessonProgress']] = relationship(back_populates='user', cascade='all, delete-orphan', passive_deletes=True)
    course_progress: Mapped[list['CourseProgress']] = relationship(back_populates='user', cascade='all, delete-orphan', passive_deletes=True)
    service_requests: Mapped[list['ServiceRequest']] = relationship(back_populates='user', cascade='all, delete-orphan', passive_deletes=True)
    service_request_events: Mapped[list['ServiceRequestEvent']] = relationship(back_populates='changed_by_user', passive_deletes=True)
    audit_logs: Mapped[list['AuditLog']] = relationship(back_populates='actor', passive_deletes=True)


class Profile(Base):
    __tablename__ = 'profiles'

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    date_of_birth: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    country: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    education_level: Mapped[EducationLevel | None] = mapped_column(
        sa.Enum(EducationLevel, name='education_level', create_type=True),
        nullable=True,
    )
    school: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    what_brings_you: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    fields_of_study: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    countries_of_interest: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    user: Mapped[User] = relationship(back_populates='profile')


class Subscription(Base):
    __tablename__ = 'subscriptions'
    __table_args__ = (
        Index('ix_subscriptions_user_id', 'user_id'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    plan: Mapped[SubscriptionPlan] = mapped_column(
        sa.Enum(SubscriptionPlan, name='subscription_plan', create_type=True),
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        sa.Enum(SubscriptionStatus, name='subscription_status', create_type=True),
        nullable=False,
    )
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    user: Mapped[User] = relationship(back_populates='subscriptions', passive_deletes=True)


class Consent(Base):
    __tablename__ = 'consents'
    __table_args__ = (
        Index('ix_consents_user_id', 'user_id'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    consent_type: Mapped[ConsentType] = mapped_column(
        sa.Enum(ConsentType, name='consent_type', create_type=True),
        nullable=False,
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())

    user: Mapped[User] = relationship(back_populates='consents', passive_deletes=True)


class Course(Base):
    __tablename__ = 'courses'
    __table_args__ = (
        Index('ix_courses_status', 'status'),
        Index('ix_courses_updated_at', 'updated_at'),
        Index('ix_courses_access_type', 'access_type'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    learning_outcomes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list, server_default=sa.text("'[]'::json"))
    structure_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default='1')
    access_type: Mapped[AccessType] = mapped_column(
        sa.Enum(AccessType, name='access_type', create_type=True),
        nullable=False,
    )
    status: Mapped[CourseStatus] = mapped_column(
        sa.Enum(CourseStatus, name='course_status', create_type=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    modules: Mapped[list['Module']] = relationship(back_populates='course', cascade='all, delete-orphan', passive_deletes=True)


class Module(Base):
    __tablename__ = 'modules'
    __table_args__ = (
        Index('ix_modules_course_id', 'course_id'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('courses.id', ondelete='CASCADE'), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    course: Mapped[Course] = relationship(back_populates='modules')
    lessons: Mapped[list['Lesson']] = relationship(back_populates='module', cascade='all, delete-orphan', passive_deletes=True)


class Lesson(Base):
    __tablename__ = 'lessons'
    __table_args__ = (
        Index('ix_lessons_module_id', 'module_id'),
        sa.CheckConstraint("video_provider IS NULL OR video_provider IN ('youtube', 'vimeo')", name='ck_lessons_video_provider'),
        sa.CheckConstraint('(video_provider IS NULL) = (video_id IS NULL)', name='ck_lessons_video_pair'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('modules.id', ondelete='CASCADE'), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    try_it_yourself_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default='0')
    video_provider: Mapped[str | None] = mapped_column(String(16), nullable=True)
    video_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resources: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list, server_default=sa.text("'[]'::jsonb"))
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    module: Mapped[Module] = relationship(back_populates='lessons')
    progress: Mapped[list['LessonProgress']] = relationship(back_populates='lesson', cascade='all, delete-orphan')
    versions: Mapped[list['LessonVersion']] = relationship(back_populates='lesson', cascade='all, delete-orphan', passive_deletes=True)


class LessonVersion(Base):
    __tablename__ = 'lesson_versions'
    __table_args__ = (
        sa.UniqueConstraint('lesson_id', 'version_no', name='uq_lesson_versions_lesson_version'),
        Index('ix_lesson_versions_lesson_saved_at', 'lesson_id', sa.text('saved_at DESC')),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lesson_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('lessons.id', ondelete='CASCADE'), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    try_it_yourself_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    video_provider: Mapped[str | None] = mapped_column(String(16), nullable=True)
    video_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resources: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list, server_default=sa.text("'[]'::jsonb"))
    note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    saved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())

    lesson: Mapped[Lesson] = relationship(back_populates='versions')
    saved_by_user: Mapped['User | None'] = relationship()


class LessonProgress(Base):
    __tablename__ = 'lesson_progress'
    __table_args__ = (
        Index('ix_lesson_progress_user_id', 'user_id'),
        Index('ix_lesson_progress_lesson_id', 'lesson_id'),
        sa.UniqueConstraint('user_id', 'lesson_id', name='uq_lesson_progress_user_lesson'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    lesson_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('lessons.id', ondelete='CASCADE'), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates='lesson_progress', passive_deletes=True)
    lesson: Mapped[Lesson] = relationship(back_populates='progress')


class CourseProgress(Base):
    __tablename__ = 'course_progress'
    __table_args__ = (
        Index('ix_course_progress_user_id', 'user_id'),
        Index('ix_course_progress_course_id', 'course_id'),
        sa.UniqueConstraint('user_id', 'course_id', name='uq_course_progress_user_course'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('courses.id', ondelete='CASCADE'), nullable=False)
    completed_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False)
    percent: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now())

    user: Mapped[User] = relationship(back_populates='course_progress', passive_deletes=True)


class Resource(Base):
    __tablename__ = 'resources'
    __table_args__ = (
        Index('ix_resources_category', 'category'),
        Index('ix_resources_status', 'status'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    access_type: Mapped[AccessType] = mapped_column(
        sa.Enum(AccessType, name='access_type', create_type=True),
        nullable=False,
    )
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[ResourceStatus] = mapped_column(
        sa.Enum(ResourceStatus, name='resource_status', create_type=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )


class Opportunity(Base):
    __tablename__ = 'opportunities'
    __table_args__ = (
        Index('ix_opportunities_deadline', 'deadline'),
        Index('ix_opportunities_category', 'category'),
        Index('ix_opportunities_created_by', 'created_by'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )


class Masterclass(Base):
    __tablename__ = 'masterclasses'
    __table_args__ = (
        Index('ix_masterclasses_session_datetime', 'session_datetime'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    speaker_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    session_link: Mapped[str] = mapped_column(String(500), nullable=False)
    access_type: Mapped[AccessType] = mapped_column(
        sa.Enum(AccessType, name='access_type', create_type=True),
        nullable=False,
    )
    recording_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )


class HomepagePost(Base):
    __tablename__ = 'homepage_posts'
    __table_args__ = (
        Index('ix_homepage_posts_status', 'status'),
        Index('ix_homepage_posts_pinned', 'pinned'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    sections: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=sa.text("'[]'::jsonb"))
    status: Mapped[HomepageStatus] = mapped_column(
        sa.Enum(HomepageStatus, name='homepage_post_status', create_type=True),
        nullable=False,
    )
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    pin_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )


class ServiceRequest(Base):
    __tablename__ = 'service_requests'
    __table_args__ = (
        Index('ix_service_requests_user_id', 'user_id'),
        Index('ix_service_requests_status', 'status'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    service_type: Mapped[ServiceType] = mapped_column(
        sa.Enum(ServiceType, name='service_type', create_type=True),
        nullable=False,
    )
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[ServiceStatus] = mapped_column(
        sa.Enum(ServiceStatus, name='service_status', create_type=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    user: Mapped[User] = relationship(back_populates='service_requests', passive_deletes=True)
    events: Mapped[list['ServiceRequestEvent']] = relationship(back_populates='service_request', cascade='all, delete-orphan')


class ServiceRequestEvent(Base):
    __tablename__ = 'service_request_events'
    __table_args__ = (
        Index('ix_service_request_events_service_request_id', 'service_request_id'),
        Index('ix_service_request_events_changed_by', 'changed_by'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('service_requests.id', ondelete='CASCADE'), nullable=False)
    from_status: Mapped[ServiceStatus | None] = mapped_column(
        sa.Enum(ServiceStatus, name='service_status', create_type=False),
        nullable=True,
    )
    to_status: Mapped[ServiceStatus] = mapped_column(
        sa.Enum(ServiceStatus, name='service_status', create_type=False),
        nullable=False,
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())

    service_request: Mapped[ServiceRequest] = relationship(back_populates='events')
    changed_by_user: Mapped[User] = relationship(back_populates='service_request_events', foreign_keys=[changed_by], passive_deletes=True)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    __table_args__ = (
        Index('ix_audit_logs_actor_id', 'actor_id'),
        Index('ix_audit_logs_entity_type', 'entity_type'),
        Index('ix_audit_logs_entity_id', 'entity_id'),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(255), nullable=False)
    extra_data: Mapped[dict | None] = mapped_column('metadata', JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=sa.func.now())

    actor: Mapped[User] = relationship(back_populates='audit_logs', passive_deletes=True)
