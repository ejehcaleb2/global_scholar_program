"""Admin analytics endpoints; registered in admin_content."""

from ._admin_content_common import (
    AdminCourseFunnelLesson,
    AdminCourseFunnelResponse,
    AdminCourseImpactResponse,
    AdminCourseLargestDrop,
    AdminCourseLearnerFacets,
    AdminCourseLearnerItem,
    AdminCourseLearnerUser,
    AdminCourseLearnersResponse,
    AdminCourseReadinessResponse,
    AdminCourseStatsResponse,
    AdminLessonImpactResponse,
    AdminModuleImpactResponse,
    AsyncSession,
    Course,
    Depends,
    Float,
    HTTPException,
    Integer,
    Lesson,
    LessonProgress,
    Module,
    Profile,
    Query,
    Subscription,
    UUID,
    User,
    _course_impact,
    _get_or_404,
    _lesson_impact,
    _module_impact,
    _readiness_response,
    active_subscription_criteria,
    case,
    cast,
    datetime,
    distinct,
    exists,
    func,
    get_db,
    or_,
    require_admin,
    router,
    select,
    status,
    timedelta,
    timezone,
)


async def get_admin_course_stats(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminCourseStatsResponse:
    structure = (
        await db.execute(
            select(
                Course.id,
                func.count(distinct(Module.id)).label('module_count'),
                func.count(Lesson.id).label('lesson_count'),
                func.coalesce(func.sum(Lesson.duration_minutes), 0).label('total_minutes'),
                func.coalesce(func.sum(case((Lesson.id.is_not(None) & (Lesson.duration_minutes <= 0), 1), else_=0)), 0).label('lessons_without_duration'),
            )
            .outerjoin(Module, Module.course_id == Course.id)
            .outerjoin(Lesson, Lesson.module_id == Module.id)
            .where(Course.id == course_id)
            .group_by(Course.id)
        )
    ).one_or_none()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')

    learner_progress = (
        select(
            LessonProgress.user_id.label('user_id'),
            func.count(distinct(LessonProgress.lesson_id)).label('completed_count'),
            func.max(LessonProgress.completed_at).label('last_activity_at'),
        )
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.course_id == course_id, LessonProgress.completed_at.is_not(None))
        .group_by(LessonProgress.user_id)
        .subquery()
    )
    percent_progress = cast(learner_progress.c.completed_count * 100.0, Float) / structure.lesson_count
    learner_stats = (
        await db.execute(
            select(
                func.count(learner_progress.c.user_id).label('learners_started'),
                func.coalesce(func.sum(case((learner_progress.c.completed_count >= structure.lesson_count, 1), else_=0)), 0).label('learners_completed'),
                func.coalesce(func.avg(percent_progress), 0.0).label('average_progress'),
                func.max(learner_progress.c.last_activity_at).label('last_learner_activity_at'),
            )
        )
    ).one()
    started = learner_stats.learners_started
    return AdminCourseStatsResponse(
        module_count=structure.module_count,
        lesson_count=structure.lesson_count,
        total_minutes=structure.total_minutes,
        lessons_without_duration=structure.lessons_without_duration,
        learners_started=started,
        learners_completed=learner_stats.learners_completed,
        completion_rate=(learner_stats.learners_completed * 100.0 / started) if started else 0.0,
        average_progress=learner_stats.average_progress,
        last_learner_activity_at=learner_stats.last_learner_activity_at,
    )

async def get_admin_course_funnel(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminCourseFunnelResponse:
    completed_by_lesson = (
        select(
            LessonProgress.lesson_id.label('lesson_id'),
            func.count(distinct(LessonProgress.user_id)).label('completed_count'),
        )
        .where(LessonProgress.completed_at.is_not(None))
        .group_by(LessonProgress.lesson_id)
        .subquery()
    )
    started_users = (
        select(distinct(LessonProgress.user_id))
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.course_id == course_id, LessonProgress.completed_at.is_not(None))
        .subquery()
    )
    started_count = select(func.count()).select_from(started_users).scalar_subquery()
    rows = (
        await db.execute(
            select(
                Lesson.id.label('lesson_id'),
                Module.id.label('module_id'),
                Lesson.order.label('lesson_order'),
                Module.order.label('module_order'),
                Lesson.title.label('title'),
                func.coalesce(completed_by_lesson.c.completed_count, 0).label('completed_count'),
                started_count.label('learners_started'),
            )
            .select_from(Course)
            .outerjoin(Module, Module.course_id == Course.id)
            .outerjoin(Lesson, Lesson.module_id == Module.id)
            .outerjoin(completed_by_lesson, completed_by_lesson.c.lesson_id == Lesson.id)
            .where(Course.id == course_id)
            .order_by(Module.order, Lesson.order)
        )
    ).all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')

    learners_started = int(rows[0].learners_started or 0)
    lessons = [
        AdminCourseFunnelLesson(
            lesson_id=row.lesson_id,
            module_id=row.module_id,
            position=position,
            title=row.title,
            completed_count=int(row.completed_count),
            percent_of_started=(int(row.completed_count) * 100.0 / learners_started) if learners_started else 0.0,
        )
        for position, row in enumerate(rows, start=1)
        if row.lesson_id is not None
    ]
    largest_drop: AdminCourseLargestDrop | None = None
    largest_points = 0.0
    for previous, current in zip(lessons, lessons[1:]):
        points = previous.percent_of_started - current.percent_of_started
        if points > largest_points:
            largest_points = points
            largest_drop = AdminCourseLargestDrop(
                from_lesson_id=previous.lesson_id,
                to_lesson_id=current.lesson_id,
                points=points,
            )
    return AdminCourseFunnelResponse(lessons=lessons, learners_started=learners_started, largest_drop=largest_drop)

async def get_admin_course_learners(
    course_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, alias='q', max_length=255),
    learner_status: str | None = Query(default=None, alias='status', pattern='^(not_started|in_progress|completed|inactive)$'),
    sort: str = Query(default='progress_desc', pattern='^(progress_desc|progress_asc|activity_desc|name_asc)$'),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminCourseLearnersResponse:
    course = await db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')

    now = datetime.now(timezone.utc)
    inactive_before = now - timedelta(days=14)
    progress = (
        select(
            LessonProgress.user_id.label('user_id'),
            func.count(distinct(case((LessonProgress.completed_at.is_not(None), LessonProgress.lesson_id)))).label('completed_lessons'),
            func.count(LessonProgress.id).label('progress_rows'),
            func.max(LessonProgress.completed_at).label('last_activity_at'),
        )
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.course_id == course_id)
        .group_by(LessonProgress.user_id)
        .subquery()
    )
    paid_membership = exists(
        select(Subscription.id).where(*active_subscription_criteria(User.id, now))
    )
    plan_state = case((paid_membership, 'paid'), else_='free')
    total_lessons = (
        select(func.count(Lesson.id))
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.course_id == course_id)
        .scalar_subquery()
    )
    completed_lessons = func.coalesce(progress.c.completed_lessons, 0)
    progress_rows = func.coalesce(progress.c.progress_rows, 0)
    percent = case(
        (total_lessons > 0, cast(completed_lessons * 100.0, Float) / total_lessons),
        else_=0.0,
    )
    status_expression = case(
        (progress_rows == 0, 'not_started'),
        ((total_lessons > 0) & (completed_lessons >= total_lessons), 'completed'),
        ((completed_lessons > 0) & (progress.c.last_activity_at < inactive_before), 'inactive'),
        else_='in_progress',
    )
    student_rows = (
        select(
            User.id.label('user_id'),
            User.email.label('email'),
            Profile.full_name.label('full_name'),
            Profile.avatar_url.label('avatar_url'),
            plan_state.label('plan_state'),
            completed_lessons.label('completed_lessons'),
            total_lessons.label('total_lessons'),
            cast(percent, Integer).label('percent'),
            progress.c.last_activity_at.label('last_activity_at'),
            status_expression.label('status'),
            progress_rows.label('progress_rows'),
        )
        .select_from(User)
        .outerjoin(Profile, Profile.user_id == User.id)
        .outerjoin(progress, progress.c.user_id == User.id)
        .where(User.role == 'student', User.is_active.is_(True))
        .cte('course_learners')
    )
    accessibility = or_(course.access_type == 'free', student_rows.c.plan_state == 'paid')
    facet_visibility = or_(student_rows.c.progress_rows > 0, accessibility)
    facet_rows = (
        await db.execute(
            select(student_rows.c.status, func.count())
            .where(facet_visibility)
            .group_by(student_rows.c.status)
        )
    ).all()
    facet_counts = {row.status: int(row[1]) for row in facet_rows}

    filters = [student_rows.c.progress_rows > 0]
    if learner_status is not None:
        filters.append(student_rows.c.status == learner_status)
        if learner_status == 'not_started':
            filters.clear()
            filters.append(accessibility)
        else:
            filters.append(student_rows.c.progress_rows > 0)
    if search:
        escaped_search = search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        pattern = f'%{escaped_search}%'
        filters.append(or_(student_rows.c.full_name.ilike(pattern, escape='\\'), student_rows.c.email.ilike(pattern, escape='\\')))

    count_query = select(func.count()).select_from(student_rows).where(*filters)
    total = int(await db.scalar(count_query) or 0)
    if sort == 'progress_asc':
        ordering = [student_rows.c.percent.asc(), student_rows.c.full_name.asc().nullslast(), student_rows.c.email.asc()]
    elif sort == 'activity_desc':
        ordering = [student_rows.c.last_activity_at.desc().nullslast(), student_rows.c.full_name.asc().nullslast(), student_rows.c.email.asc()]
    elif sort == 'name_asc':
        ordering = [func.coalesce(student_rows.c.full_name, student_rows.c.email).asc()]
    else:
        ordering = [student_rows.c.percent.desc(), student_rows.c.full_name.asc().nullslast(), student_rows.c.email.asc()]
    learner_rows = (
        await db.execute(
            select(student_rows)
            .where(*filters)
            .order_by(*ordering)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [
        AdminCourseLearnerItem(
            user=AdminCourseLearnerUser(id=row.user_id, full_name=row.full_name, email=row.email, avatar_url=row.avatar_url),
            plan_state=row.plan_state,
            completed_lessons=row.completed_lessons,
            total_lessons=row.total_lessons,
            percent=row.percent,
            last_activity_at=row.last_activity_at,
            status=row.status,
        )
        for row in learner_rows
    ]
    return AdminCourseLearnersResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        facets=AdminCourseLearnerFacets(
            not_started=facet_counts.get('not_started', 0),
            in_progress=facet_counts.get('in_progress', 0),
            completed=facet_counts.get('completed', 0),
            inactive=facet_counts.get('inactive', 0),
        ),
    )

async def get_admin_course_impact(
    course_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseImpactResponse:
    course = await _get_or_404(db, Course, course_id, 'Course')
    return await _course_impact(db, course)

async def get_admin_module_impact(
    module_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminModuleImpactResponse:
    module = await _get_or_404(db, Module, module_id, 'Module')
    return await _module_impact(db, module)

async def get_admin_lesson_impact(
    lesson_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminLessonImpactResponse:
    lesson = await _get_or_404(db, Lesson, lesson_id, 'Lesson')
    return await _lesson_impact(db, lesson)

async def get_admin_course_readiness(
    course_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseReadinessResponse:
    _, readiness = await _readiness_response(db, course_id)
    return readiness
