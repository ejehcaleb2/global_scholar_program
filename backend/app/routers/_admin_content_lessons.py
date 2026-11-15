"""Admin lessons endpoints; registered in admin_content."""

from ._admin_content_common import (
    AdminLessonVersionDetail,
    AdminLessonVersionRestoreRequest,
    AdminLessonVersionsResponse,
    AsyncSession,
    Course,
    CourseStatus,
    Depends,
    HTTPException,
    LESSON_VERSION_FIELDS,
    Lesson,
    LessonPatch,
    LessonResponse,
    LessonVersion,
    LessonWrite,
    Module,
    UUID,
    User,
    _bump_structure_revision,
    _get_or_404,
    _lesson_impact,
    _lesson_version_changed_fields,
    _require_current_version,
    _require_destructive_confirmation,
    _sanitize_lesson_body,
    _save_lesson_version,
    _version_actor,
    get_db,
    joinedload,
    parse_lesson_video_url,
    refresh_course_progress_for_course,
    require_admin,
    router,
    select,
    status,
    write_audit_log,
)


async def create_lesson(
    module_id: UUID,
    payload: LessonWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LessonResponse:
    module = await _get_or_404(db, Module, module_id, 'Module')
    lesson = Lesson(module_id=module_id, body_html=_sanitize_lesson_body(payload.body_html), **payload.model_dump(exclude={'body_html'}))
    db.add(lesson)
    await db.flush()
    await _bump_structure_revision(db, module.course_id)
    await refresh_course_progress_for_course(db, module.course_id)
    await write_audit_log(db, admin.id, 'created', 'lesson', lesson.id, lesson.title)
    await db.commit()
    return LessonResponse.model_validate(lesson)

async def update_lesson(
    module_id: UUID,
    lesson_id: UUID,
    payload: LessonPatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LessonResponse:
    module = await db.scalar(select(Module).where(Module.id == module_id))
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    course = await db.scalar(select(Course).where(Course.id == module.course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    module = await db.scalar(select(Module).where(Module.id == module_id).with_for_update())
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    lesson = await db.scalar(select(Lesson).where(Lesson.id == lesson_id).with_for_update())
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    if lesson.module_id != module_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(lesson, changes.pop('expected_updated_at', None))
    order_changed = 'order' in changes and changes['order'] != lesson.order
    video_url = changes.pop('video_url', ...)
    if video_url is not ...:
        if video_url is None:
            changes['video_provider'] = None
            changes['video_id'] = None
        else:
            try:
                changes['video_provider'], changes['video_id'] = parse_lesson_video_url(video_url)
            except ValueError as error:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    if 'body_html' in changes and changes['body_html'] is not None:
        changes['body_html'] = _sanitize_lesson_body(changes['body_html'])
    before = {field: getattr(lesson, field) for field in changes}
    changed_fields = [field for field, value in changes.items() if before[field] != value]
    for field, value in changes.items():
        setattr(lesson, field, value)
    if order_changed:
        await _bump_structure_revision(db, module.course_id)
    content_changes = [field for field in changed_fields if field in LESSON_VERSION_FIELDS]
    if content_changes:
        await _save_lesson_version(db, lesson, admin.id)
    audit_changes = {
            ('video' if field in {'video_provider', 'video_id'} else field): {
                'from': before[field],
                'to': getattr(lesson, field),
            }
            for field in changed_fields
    }
    await write_audit_log(db, admin.id, 'updated', 'lesson', lesson.id, lesson.title, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(lesson)
    return LessonResponse.model_validate(lesson)

async def list_lesson_versions(
    lesson_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminLessonVersionsResponse:
    await _get_or_404(db, Lesson, lesson_id, 'Lesson')
    versions = list((await db.scalars(
        select(LessonVersion)
        .options(joinedload(LessonVersion.saved_by_user).joinedload(User.profile))
        .where(LessonVersion.lesson_id == lesson_id)
        .order_by(LessonVersion.version_no.desc())
        .limit(20)
    )).all())
    changed_fields = await _lesson_version_changed_fields(db, lesson_id, versions)
    return AdminLessonVersionsResponse(items=[
        {
            'id': version.id,
            'version_no': version.version_no,
            'saved_at': version.saved_at,
            'saved_by': _version_actor(version),
            'note': version.note,
            'changed_fields': changed_fields.get(version.saved_at, []),
        }
        for version in versions
    ])

async def get_lesson_version(
    lesson_id: UUID,
    version_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminLessonVersionDetail:
    version = await db.scalar(
        select(LessonVersion)
        .options(joinedload(LessonVersion.saved_by_user).joinedload(User.profile))
        .where(LessonVersion.lesson_id == lesson_id, LessonVersion.id == version_id)
    )
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson version not found')
    changed_fields = await _lesson_version_changed_fields(db, lesson_id, [version])
    return AdminLessonVersionDetail(
        id=version.id,
        version_no=version.version_no,
        saved_at=version.saved_at,
        saved_by=_version_actor(version),
        note=version.note,
        changed_fields=changed_fields.get(version.saved_at, []),
        title=version.title,
        body_html=version.body_html,
        try_it_yourself_prompt=version.try_it_yourself_prompt,
        duration_minutes=version.duration_minutes,
        video={'provider': version.video_provider, 'id': version.video_id} if version.video_provider and version.video_id else None,
        resources=version.resources or [],
    )

async def restore_lesson_version(
    lesson_id: UUID,
    version_id: UUID,
    payload: AdminLessonVersionRestoreRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LessonResponse:
    lesson = await db.scalar(select(Lesson).where(Lesson.id == lesson_id).with_for_update())
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    _require_current_version(lesson, payload.expected_updated_at)
    version = await db.scalar(select(LessonVersion).where(
        LessonVersion.lesson_id == lesson_id,
        LessonVersion.id == version_id,
    ))
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson version not found')
    original_values = {field: getattr(lesson, field) for field in LESSON_VERSION_FIELDS}
    lesson.title = version.title
    lesson.body_html = _sanitize_lesson_body(version.body_html)
    lesson.try_it_yourself_prompt = version.try_it_yourself_prompt
    lesson.duration_minutes = version.duration_minutes
    lesson.video_provider = version.video_provider
    lesson.video_id = version.video_id
    lesson.resources = list(version.resources or [])
    changed = [field for field in LESSON_VERSION_FIELDS if original_values[field] != getattr(lesson, field)]
    await _save_lesson_version(db, lesson, admin.id, f'Restored from version {version.version_no}')
    audit_changes = {'restored_from': version.version_no}
    for field in changed:
        key = 'video' if field in {'video_provider', 'video_id'} else field
        before = original_values[field]
        after = getattr(lesson, field)
        audit_changes[key] = {'from': {'changed': True}, 'to': {'changed': True}} if field in {'body_html', 'resources'} else {'from': before, 'to': after}
    await write_audit_log(
        db,
        admin.id,
        'updated',
        'lesson',
        lesson.id,
        lesson.title,
        audit_changes,
    )
    await db.commit()
    await db.refresh(lesson)
    return LessonResponse.model_validate(lesson)

async def duplicate_lesson(
    lesson_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LessonResponse:
    source = await db.scalar(select(Lesson).where(Lesson.id == lesson_id).with_for_update())
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    module = await db.scalar(select(Module).where(Module.id == source.module_id).with_for_update())
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    course = await db.scalar(select(Course).where(Course.id == module.course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    later_lessons = list((await db.scalars(
        select(Lesson)
        .where(Lesson.module_id == module.id, Lesson.order > source.order)
        .order_by(Lesson.order.desc())
        .with_for_update()
    )).all())
    for lesson in later_lessons:
        lesson.order += 1
    title = f'{source.title[:248]} (copy)'
    duplicate = Lesson(
        module_id=module.id,
        title=title,
        body_html=_sanitize_lesson_body(source.body_html),
        try_it_yourself_prompt=source.try_it_yourself_prompt,
        duration_minutes=source.duration_minutes,
        video_provider=source.video_provider,
        video_id=source.video_id,
        resources=list(source.resources or []),
        order=source.order + 1,
    )
    db.add(duplicate)
    await db.flush()
    await _bump_structure_revision(db, course.id)
    await refresh_course_progress_for_course(db, course.id)
    await write_audit_log(db, admin.id, 'created', 'lesson', duplicate.id, duplicate.title,
                          {'source_lesson_id': str(source.id), 'shifted_lesson_ids': [str(lesson.id) for lesson in later_lessons]},
                          affected_ids=[course.id, duplicate.id, *[lesson.id for lesson in later_lessons]])
    await db.commit()
    await db.refresh(duplicate)
    return LessonResponse.model_validate(duplicate)

async def delete_lesson(
    module_id: UUID,
    lesson_id: UUID,
    confirm_progress_loss: bool = False,
    confirm_title: str | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    module = await db.scalar(select(Module).where(Module.id == module_id))
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    course = await db.scalar(select(Course).where(Course.id == module.course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    module = await db.scalar(select(Module).where(Module.id == module_id).with_for_update())
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    lesson = await db.scalar(select(Lesson).where(Lesson.id == lesson_id).with_for_update())
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    if lesson.module_id != module_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    impact = await _lesson_impact(db, lesson)
    _require_destructive_confirmation(
        course.status == CourseStatus.published or impact.learners_with_progress > 0,
        lesson.title,
        confirm_progress_loss,
        confirm_title,
    )
    await _bump_structure_revision(db, course.id)
    await write_audit_log(db, admin.id, 'deleted', 'lesson', lesson.id, lesson.title)
    await db.delete(lesson)
    await db.flush()
    await refresh_course_progress_for_course(db, course.id)
    await db.commit()
