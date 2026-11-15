"""Shared dependencies and unchanged admin content helpers."""

from datetime import datetime, timedelta, timezone

import re

from html import unescape

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from sqlalchemy import Float, Integer, and_, case, cast, desc, distinct, exists, func, nullslast, or_, select, union_all, delete

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import joinedload, selectinload

from app.core.content import audit_field_changes, opportunity_status, parse_lesson_video_url, sanitize_html, sanitize_lesson_html, write_audit_log

from app.db.session import get_db

from app.core.progress import refresh_course_progress_for_course

from app.dependencies.auth import require_admin

from app.dependencies.membership import active_subscription_criteria

from app.models.gsp_models import AuditLog, Course, CourseProgress, CourseStatus, Lesson, LessonProgress, LessonVersion, Masterclass, Module, Opportunity, Profile, Resource, ResourceStatus, Subscription, User

from app.schemas.admin import (
    AdminCourseDetailResponse,
    AdminCourseFacetsResponse,
    AdminCourseFunnelLesson,
    AdminCourseFunnelResponse,
    AdminCourseLargestDrop,
    AdminCourseLearnerFacets,
    AdminCourseLearnerItem,
    AdminCourseLearnerUser,
    AdminCourseLearnersResponse,
    AdminCourseImpactResponse,
    AdminCourseListResponse,
    AdminCourseStatsResponse,
    AdminCourseReadinessCheck,
    AdminCourseReadinessResponse,
    AdminCourseStructureReorder,
    AdminLessonImpactResponse,
    AdminLessonVersionDetail,
    AdminLessonVersionRestoreRequest,
    AdminLessonVersionsResponse,
    AdminModuleImpactResponse,
    AdminCourseDuplicateRequest,
    AdminCourseSummaryResponse,
)

from app.schemas.content import (
    CoursePatch,
    CourseWrite,
    LessonPatch,
    LessonResponse,
    LessonWrite,
    ModulePatch,
    ModuleResponse,
    ModuleWrite,
    OpportunityPatch,
    OpportunityWrite,
    ResourcePatch,
    ResourceWrite,
)

from app.schemas.masterclass import MasterclassPatch, MasterclassWrite

from app.core.masterclass import is_masterclass_past

from app.schemas.admin_content import (
    AdminResourceResponse as ResourceResponse,
    AdminOpportunityResponse as OpportunityResponse,
    AdminMasterclassResponse as MasterclassResponse,
)

router = APIRouter(prefix='/admin', tags=['admin-content'])

async def _course_metrics(db: AsyncSession, course_ids: list[UUID]) -> dict[UUID, dict[str, int]]:
    if not course_ids:
        return {}
    structure_rows = (
        await db.execute(
            select(
                Module.course_id,
                func.count(distinct(Module.id)).label('module_count'),
                func.count(Lesson.id).label('lesson_count'),
                func.coalesce(func.sum(Lesson.duration_minutes), 0).label('duration_minutes'),
            )
            .outerjoin(Lesson, Lesson.module_id == Module.id)
            .where(Module.course_id.in_(course_ids))
            .group_by(Module.course_id)
        )
    ).all()
    metrics = {
        row.course_id: {
            'module_count': row.module_count,
            'lesson_count': row.lesson_count,
            'duration_minutes': row.duration_minutes,
            'learners_started': 0,
            'learners_completed': 0,
        }
        for row in structure_rows
    }
    summary_rows = (
        await db.execute(
            select(CourseProgress.course_id, CourseProgress.user_id)
            .where(CourseProgress.course_id.in_(course_ids))
        )
    ).all()
    started_users: dict[UUID, set[UUID]] = {}
    for course_id, user_id in summary_rows:
        course_metrics = metrics.setdefault(
            course_id,
            {'module_count': 0, 'lesson_count': 0, 'duration_minutes': 0, 'learners_started': 0, 'learners_completed': 0},
        )
        users = started_users.setdefault(course_id, set())
        users.add(user_id)
        course_metrics['learners_started'] = len(users)

    progress_rows = (
        await db.execute(
            select(Module.course_id, LessonProgress.user_id, func.count(distinct(LessonProgress.lesson_id)).label('completed'))
            .join(Lesson, Lesson.module_id == Module.id)
            .join(LessonProgress, and_(LessonProgress.lesson_id == Lesson.id, LessonProgress.completed_at.is_not(None)))
            .where(Module.course_id.in_(course_ids))
            .group_by(Module.course_id, LessonProgress.user_id)
        )
    ).all()
    for row in progress_rows:
        course_metrics = metrics.setdefault(
            row.course_id,
            {'module_count': 0, 'lesson_count': 0, 'duration_minutes': 0, 'learners_started': 0, 'learners_completed': 0},
        )
        users = started_users.setdefault(row.course_id, set())
        if row.user_id not in users:
            users.add(row.user_id)
            course_metrics['learners_started'] = len(users)
        if course_metrics['lesson_count'] > 0 and row.completed >= course_metrics['lesson_count']:
            course_metrics['learners_completed'] += 1
    return metrics

def _course_summary(course: Course, metrics: dict[str, int] | None = None) -> dict:
    values = metrics or {}
    return {
        **course.__dict__,
        'module_count': values['module_count'] if 'module_count' in values else len(course.modules),
        'lesson_count': values.get('lesson_count', 0),
        'duration_minutes': values.get('duration_minutes', 0),
        'learners_started': values.get('learners_started', 0),
        'learners_completed': values.get('learners_completed', 0),
    }

def _readiness_check(
    key: str,
    severity: str,
    passed: bool,
    english: str,
    tab: str,
    field: str | None = None,
    module_id: UUID | None = None,
    lesson_id: UUID | None = None,
) -> AdminCourseReadinessCheck:
    return AdminCourseReadinessCheck(
        key=key,
        severity=severity,
        passed=passed,
        message=english,
        tab=tab,
        field=field,
        module_id=module_id,
        lesson_id=lesson_id,
    )

def _course_readiness_checks(course: Course) -> list[AdminCourseReadinessCheck]:
    modules = sorted(course.modules, key=lambda module: module.order)
    checks = [
        _readiness_check('title', 'error', bool(course.title.strip()), 'Add a course title.', 'details', 'title'),
        _readiness_check('summary', 'warning', bool(course.summary and course.summary.strip()), 'Add a course summary.', 'details', 'summary'),
        _readiness_check('thumbnail', 'warning', bool(course.thumbnail_url), 'A thumbnail helps students recognize the course.', 'details', 'thumbnail_url'),
        _readiness_check('outcomes', 'warning', bool(course.learning_outcomes), 'Add learning outcomes for students.', 'details', 'learning_outcomes'),
        _readiness_check('modules', 'error', bool(modules), 'Add at least one module.', 'curriculum'),
    ]
    if modules:
        for module in modules:
            lessons = sorted(module.lessons, key=lambda lesson: lesson.order)
            checks.append(
                _readiness_check(
                    f'module:{module.id}:lessons',
                    'error',
                    bool(lessons),
                    f'Add a lesson to “{module.title}”.',
                    'curriculum',
                    module_id=module.id,
                )
            )
            for lesson in lessons:
                has_body = bool(unescape(re.sub(r'<[^>]*>', ' ', lesson.body_html)).strip())
                checks.append(
                    _readiness_check(
                        f'lesson:{lesson.id}:body',
                        'error',
                        has_body,
                        f'Add content to “{lesson.title}”.',
                        'curriculum',
                        module_id=module.id,
                        lesson_id=lesson.id,
                    )
                )
                if lesson.duration_minutes == 0:
                    checks.append(
                        _readiness_check(
                            f'lesson:{lesson.id}:duration',
                            'warning',
                            False,
                            f'Add a duration for “{lesson.title}”.',
                            'curriculum',
                            module_id=module.id,
                            lesson_id=lesson.id,
                        )
                    )
    return checks

async def _readiness_response(db: AsyncSession, course_id: UUID) -> tuple[Course, AdminCourseReadinessResponse]:
    course = await _course_with_content(db, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    checks = _course_readiness_checks(course)
    errors = sum(check.severity == 'error' and not check.passed for check in checks)
    warnings = sum(check.severity == 'warning' and not check.passed for check in checks)
    return course, AdminCourseReadinessResponse(
        course_id=course.id,
        structure_revision=course.structure_revision,
        errors=errors,
        warnings=warnings,
        checks=checks,
    )

async def _progress_impact(db: AsyncSession, condition) -> tuple[int, int]:
    row = (
        await db.execute(
            select(func.count(LessonProgress.id), func.count(distinct(LessonProgress.user_id)))
            .join(Lesson, LessonProgress.lesson_id == Lesson.id)
            .join(Module, Module.id == Lesson.module_id)
            .where(condition, LessonProgress.completed_at.is_not(None))
        )
    ).one()
    return row[0], row[1]

async def _course_impact(db: AsyncSession, course: Course) -> AdminCourseImpactResponse:
    module_count = await db.scalar(select(func.count(Module.id)).where(Module.course_id == course.id)) or 0
    lesson_count = await db.scalar(
        select(func.count(Lesson.id)).join(Module, Lesson.module_id == Module.id).where(Module.course_id == course.id)
    ) or 0
    rows, _ = await _progress_impact(db, Module.course_id == course.id)
    source_learners = set(
        (
            await db.scalars(
                select(distinct(LessonProgress.user_id))
                .join(Lesson, LessonProgress.lesson_id == Lesson.id)
                .join(Module, Module.id == Lesson.module_id)
                .where(Module.course_id == course.id, LessonProgress.completed_at.is_not(None))
            )
        ).all()
    )
    summary_learners = set(
        (
            await db.scalars(
                select(CourseProgress.user_id).where(CourseProgress.course_id == course.id)
            )
        ).all()
    )
    learners = len(source_learners | summary_learners)
    return AdminCourseImpactResponse(
        id=course.id,
        title=course.title,
        status=course.status,
        module_count=module_count,
        lesson_count=lesson_count,
        learners_with_progress=learners,
        progress_rows=rows,
    )

async def _module_impact(db: AsyncSession, module: Module) -> AdminModuleImpactResponse:
    lesson_count = await db.scalar(select(func.count(Lesson.id)).where(Lesson.module_id == module.id)) or 0
    rows, learners = await _progress_impact(db, Lesson.module_id == module.id)
    return AdminModuleImpactResponse(
        id=module.id,
        title=module.title,
        lesson_count=lesson_count,
        learners_with_progress=learners,
        progress_rows=rows,
    )

async def _lesson_impact(db: AsyncSession, lesson: Lesson) -> AdminLessonImpactResponse:
    rows = await db.scalar(
        select(func.count(LessonProgress.id)).where(
            LessonProgress.lesson_id == lesson.id,
            LessonProgress.completed_at.is_not(None),
        )
    ) or 0
    learners = await db.scalar(
        select(func.count(distinct(LessonProgress.user_id))).where(
            LessonProgress.lesson_id == lesson.id,
            LessonProgress.completed_at.is_not(None),
        )
    ) or 0
    return AdminLessonImpactResponse(
        id=lesson.id,
        title=lesson.title,
        learners_with_progress=learners,
        progress_rows=rows,
    )

LESSON_VERSION_FIELDS = (
    'title', 'body_html', 'try_it_yourself_prompt', 'duration_minutes',
    'video_provider', 'video_id', 'resources',
)

async def _save_lesson_version(
    db: AsyncSession,
    lesson: Lesson,
    saved_by: UUID,
    note: str | None = None,
) -> LessonVersion:
    latest = await db.scalar(
        select(func.max(LessonVersion.version_no)).where(LessonVersion.lesson_id == lesson.id)
    )
    version = LessonVersion(
        lesson_id=lesson.id,
        version_no=(latest or 0) + 1,
        title=lesson.title,
        body_html=lesson.body_html,
        try_it_yourself_prompt=lesson.try_it_yourself_prompt,
        duration_minutes=lesson.duration_minutes,
        video_provider=lesson.video_provider,
        video_id=lesson.video_id,
        resources=list(lesson.resources or []),
        note=note,
        saved_by=saved_by,
    )
    db.add(version)
    await db.flush()
    keep_ids = select(LessonVersion.id).where(
        LessonVersion.lesson_id == lesson.id
    ).order_by(LessonVersion.version_no.desc()).limit(20)
    await db.execute(
        delete(LessonVersion).where(
            LessonVersion.lesson_id == lesson.id,
            LessonVersion.id.not_in(keep_ids),
        )
    )
    return version

async def _lesson_version_changed_fields(
    db: AsyncSession,
    lesson_id: UUID,
    versions: list[LessonVersion],
) -> dict[datetime, list[str]]:
    if not versions:
        return {}
    audit_rows = (await db.execute(
        select(AuditLog.created_at, AuditLog.extra_data)
        .where(
            AuditLog.entity_type == 'lesson',
            AuditLog.entity_id == str(lesson_id),
            AuditLog.action == 'updated',
            AuditLog.created_at.in_([version.saved_at for version in versions]),
        )
    )).all()
    return {
        created_at: sorted(
            field for field in (extra_data or {}).get('changes', {}).keys()
            if field != 'restored_from'
        )
        for created_at, extra_data in audit_rows
    }

def _version_actor(version: LessonVersion) -> dict | None:
    user = version.saved_by_user
    if user is None:
        return None
    return {'id': user.id, 'full_name': user.profile.full_name if user.profile else None}

def _require_destructive_confirmation(required: bool, title: str, confirm_progress_loss: bool, confirm_title: str | None) -> None:
    if required and (not confirm_progress_loss or confirm_title != title):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'confirmation_required',
                'required_title': title,
                'confirm_progress_loss': True,
            },
        )

async def _bump_structure_revision(db: AsyncSession, course_id: UUID) -> Course:
    course = await db.scalar(select(Course).where(Course.id == course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    course.structure_revision += 1
    return course

async def _set_course_publication_state(
    course_id: UUID,
    target_status: CourseStatus,
    admin: User,
    db: AsyncSession,
) -> AdminCourseSummaryResponse:
    course = await db.scalar(
        select(Course).where(Course.id == course_id).with_for_update()
    )
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    if target_status == CourseStatus.published and course.status != CourseStatus.published:
        _, readiness = await _readiness_response(db, course_id)
        if readiness.errors:
            errors = [check.model_dump(mode='json') for check in readiness.checks if check.severity == 'error' and not check.passed]
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={'code': 'not_ready', 'errors': errors})
    previous_status = course.status
    course.status = target_status
    action = 'published' if target_status == CourseStatus.published else 'unpublished'
    await write_audit_log(db, admin.id, action, 'course', course.id, course.title,
                          {'status': {'from': previous_status.value, 'to': target_status.value}})
    await db.commit()
    await db.refresh(course)
    metrics = await _course_metrics(db, [course_id])
    return AdminCourseSummaryResponse.model_validate(_course_summary(course, metrics.get(course_id)))

async def _course_with_content(db: AsyncSession, course_id: UUID) -> Course | None:
    return await db.scalar(
        select(Course)
        .options(selectinload(Course.modules).selectinload(Module.lessons))
        .where(Course.id == course_id)
        .execution_options(populate_existing=True)
    )

async def _get_or_404(db: AsyncSession, model: type, entity_id: UUID, label: str, *, lock: bool = False):
    entity = await db.scalar(select(model).where(model.id == entity_id).with_for_update()) if lock else await db.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f'{label} not found')
    return entity

def _sanitize_lesson_body(value: str) -> str:
    try:
        return sanitize_lesson_html(value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

def _require_current_version(entity, expected_updated_at) -> None:
    if expected_updated_at is not None and entity.updated_at != expected_updated_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'stale_version',
                'latest_updated_at': entity.updated_at.isoformat(),
            },
        )
