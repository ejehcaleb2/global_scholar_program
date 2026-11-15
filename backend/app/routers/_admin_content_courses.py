"""Admin courses endpoints; registered in admin_content."""

from ._admin_content_common import (
    AdminCourseDetailResponse,
    AdminCourseDuplicateRequest,
    AdminCourseFacetsResponse,
    AdminCourseListResponse,
    AdminCourseSummaryResponse,
    AsyncSession,
    Course,
    CoursePatch,
    CourseProgress,
    CourseStatus,
    CourseWrite,
    Depends,
    HTTPException,
    Lesson,
    LessonProgress,
    Module,
    Query,
    UUID,
    User,
    _course_impact,
    _course_metrics,
    _course_readiness_checks,
    _course_summary,
    _course_with_content,
    _require_current_version,
    _require_destructive_confirmation,
    _set_course_publication_state,
    audit_field_changes,
    desc,
    distinct,
    func,
    get_db,
    or_,
    require_admin,
    router,
    sanitize_html,
    select,
    selectinload,
    status,
    union_all,
    write_audit_log,
)


async def list_admin_courses(
    course_status: CourseStatus | None = Query(default=None, alias='status'),
    search: str | None = Query(default=None, max_length=255),
    access_type: str | None = Query(default=None, pattern='^(free|members_only)$'),
    sort: str | None = Query(default=None, pattern='^(updated|title|learners)$'),
    limit: int | None = Query(default=None, ge=1, le=50),
    offset: int | None = Query(default=None, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AdminCourseSummaryResponse] | AdminCourseListResponse:
    paginated = limit is not None or offset is not None or search is not None or access_type is not None or sort is not None
    page_size = limit or 20
    if paginated and page_size not in {10, 20, 50}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='limit must be 10, 20, or 50')

    query = select(Course)
    count_query = select(func.count(Course.id))
    if course_status is not None:
        query = query.where(Course.status == course_status)
        count_query = count_query.where(Course.status == course_status)
    if access_type is not None:
        query = query.where(Course.access_type == access_type)
        count_query = count_query.where(Course.access_type == access_type)
    if search:
        search_filter = or_(Course.title.ilike(f'%{search}%'), Course.summary.ilike(f'%{search}%'))
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    learner_sources = union_all(
        select(CourseProgress.course_id.label('course_id'), CourseProgress.user_id.label('user_id')),
        select(Module.course_id.label('course_id'), LessonProgress.user_id.label('user_id'))
        .join(Lesson, Lesson.module_id == Module.id)
        .join(LessonProgress, LessonProgress.lesson_id == Lesson.id)
        .where(LessonProgress.completed_at.is_not(None)),
    ).subquery()
    learner_counts = (
        select(learner_sources.c.course_id, func.count(distinct(learner_sources.c.user_id)).label('learners'))
        .group_by(learner_sources.c.course_id)
        .subquery()
    )
    if paginated and sort == 'learners':
        query = query.outerjoin(learner_counts, learner_counts.c.course_id == Course.id).order_by(
            desc(func.coalesce(learner_counts.c.learners, 0)), Course.id.asc()
        )
    elif paginated and sort == 'title':
        query = query.order_by(Course.title.asc(), Course.id.asc())
    else:
        query = query.order_by(Course.updated_at.desc(), Course.title.asc(), Course.id.asc())

    total = (await db.scalar(count_query)) or 0
    if paginated:
        query = query.limit(page_size).offset(offset or 0)
    courses = (await db.scalars(query.options(selectinload(Course.modules).selectinload(Module.lessons)))).unique().all()
    metrics = await _course_metrics(db, [course.id for course in courses])
    items = [AdminCourseSummaryResponse.model_validate(_course_summary(course, metrics.get(course.id))) for course in courses]
    if paginated:
        return AdminCourseListResponse(items=items, total=total, limit=page_size, offset=offset or 0)
    return items

async def get_admin_course_facets(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminCourseFacetsResponse:
    counts = (
        await db.execute(
            select(
                func.count(Course.id).label('all'),
                func.count(Course.id).filter(Course.status == CourseStatus.published).label('published'),
                func.count(Course.id).filter(Course.status == CourseStatus.draft).label('draft'),
                func.count(Course.id).filter(Course.access_type == 'free').label('free'),
                func.count(Course.id).filter(Course.access_type == 'members_only').label('members_only'),
            )
        )
    ).one()
    return AdminCourseFacetsResponse.model_validate(counts._mapping)

async def get_admin_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminCourseDetailResponse:
    course = await _course_with_content(db, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    metrics = await _course_metrics(db, [course.id])
    modules = sorted(course.modules, key=lambda module: module.order)
    module_values = [
        {
            **module.__dict__,
            'lessons': [
                {**lesson.__dict__, 'completed': False}
                for lesson in sorted(module.lessons, key=lambda lesson: lesson.order)
            ],
        }
        for module in modules
    ]
    return AdminCourseDetailResponse.model_validate(
        {
            **_course_summary(course, metrics.get(course.id)),
            'module_count': len(modules),
            'modules': module_values,
        }
    )

async def publish_admin_course(
    course_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseSummaryResponse:
    return await _set_course_publication_state(course_id, CourseStatus.published, admin, db)

async def unpublish_admin_course(
    course_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseSummaryResponse:
    return await _set_course_publication_state(course_id, CourseStatus.draft, admin, db)

async def duplicate_admin_course(
    course_id: UUID,
    payload: AdminCourseDuplicateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseSummaryResponse:
    source = await _course_with_content(db, course_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    title = (payload.title or f'{source.title} (copy)').strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Course title is required')
    duplicate = Course(
        title=title,
        summary=sanitize_html(source.summary) if source.summary is not None else None,
        description=sanitize_html(source.description) if source.description is not None else None,
        thumbnail_url=source.thumbnail_url,
        learning_outcomes=list(source.learning_outcomes or []),
        access_type=source.access_type,
        status=CourseStatus.draft,
    )
    duplicate.modules = [
        Module(
            title=module.title,
            order=module.order,
            lessons=[
                Lesson(
                    title=lesson.title,
                    body_html=sanitize_html(lesson.body_html),
                    try_it_yourself_prompt=lesson.try_it_yourself_prompt,
                    duration_minutes=lesson.duration_minutes,
                    order=lesson.order,
                )
                for lesson in sorted(module.lessons, key=lambda lesson: lesson.order)
            ],
        )
        for module in sorted(source.modules, key=lambda module: module.order)
    ]
    db.add(duplicate)
    await db.flush()
    await write_audit_log(db, admin.id, 'created', 'course', duplicate.id, duplicate.title,
                          {'source_course_id': str(source.id)},
                          affected_ids=[duplicate.id, *[module.id for module in duplicate.modules],
                                        *[lesson.id for module in duplicate.modules for lesson in module.lessons]])
    await db.commit()
    copied = await _course_with_content(db, duplicate.id)
    metrics = await _course_metrics(db, [duplicate.id])
    return AdminCourseSummaryResponse.model_validate(_course_summary(copied, metrics.get(duplicate.id)))

async def create_course(
    payload: CourseWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseSummaryResponse:
    course = Course(**payload.model_dump())
    db.add(course)
    await db.flush()
    await write_audit_log(db, admin.id, 'created', 'course', course.id, course.title)
    await db.commit()
    return AdminCourseSummaryResponse.model_validate({**course.__dict__, 'module_count': 0})

async def update_course(
    course_id: UUID,
    payload: CoursePatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseSummaryResponse:
    course = await db.scalar(
        select(Course).options(selectinload(Course.modules).selectinload(Module.lessons)).where(Course.id == course_id).with_for_update()
    )
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    previous_status = course.status
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(course, changes.pop('expected_updated_at', None))
    status_requested = 'status' in changes
    desired_status = changes.pop('status', course.status)
    audit_changes = audit_field_changes(course, {**changes, 'status': desired_status})
    for field, value in changes.items():
        setattr(course, field, value)
    if desired_status == CourseStatus.published and previous_status != CourseStatus.published:
        checks = _course_readiness_checks(course)
        errors = [check.model_dump(mode='json') for check in checks if check.severity == 'error' and not check.passed]
        if errors:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={'code': 'not_ready', 'errors': errors})
    course.status = desired_status
    module_count = len(course.modules)
    action = 'updated'
    if status_requested and course.status != previous_status:
        action = 'published' if course.status == CourseStatus.published else 'unpublished'
    await write_audit_log(db, admin.id, action, 'course', course.id, course.title, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(course)
    return AdminCourseSummaryResponse.model_validate({**course.__dict__, 'module_count': module_count})

async def delete_course(
    course_id: UUID,
    confirm_progress_loss: bool = False,
    confirm_title: str | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    course = await db.scalar(select(Course).where(Course.id == course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    impact = await _course_impact(db, course)
    _require_destructive_confirmation(
        course.status == CourseStatus.published or impact.learners_with_progress > 0,
        course.title,
        confirm_progress_loss,
        confirm_title,
    )
    descendants = (await db.execute(select(Module.id, Lesson.id).select_from(Module).outerjoin(Lesson).where(Module.course_id == course.id))).all()
    affected_ids = list(dict.fromkeys([course.id, *[identifier for row in descendants for identifier in row if identifier is not None]]))
    await write_audit_log(db, admin.id, 'deleted', 'course', course.id, course.title, affected_ids=affected_ids)
    await db.delete(course)
    await db.commit()
