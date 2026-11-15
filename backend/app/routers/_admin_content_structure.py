"""Admin structure endpoints; registered in admin_content."""

from ._admin_content_common import (
    AdminCourseDetailResponse,
    AdminCourseStructureReorder,
    AsyncSession,
    Course,
    CourseStatus,
    Depends,
    HTTPException,
    Lesson,
    Module,
    ModulePatch,
    ModuleResponse,
    ModuleWrite,
    UUID,
    User,
    _bump_structure_revision,
    _course_metrics,
    _course_summary,
    _course_with_content,
    _get_or_404,
    _module_impact,
    _require_current_version,
    _require_destructive_confirmation,
    audit_field_changes,
    get_db,
    refresh_course_progress_for_course,
    require_admin,
    router,
    select,
    selectinload,
    status,
    write_audit_log,
)


async def reorder_admin_course_structure(
    course_id: UUID,
    payload: AdminCourseStructureReorder,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseDetailResponse:
    course = await db.scalar(
        select(Course)
        .options(selectinload(Course.modules).selectinload(Module.lessons))
        .where(Course.id == course_id)
        .with_for_update()
    )
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    if course.structure_revision != payload.structure_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={'code': 'stale_revision', 'latest_structure_revision': course.structure_revision},
        )

    modules_by_id = {module.id: module for module in course.modules}
    requested_module_ids = [item.id for item in payload.modules]
    if len(requested_module_ids) != len(set(requested_module_ids)) or set(requested_module_ids) != set(modules_by_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Reorder must include each course module exactly once')
    lessons_by_id = {lesson.id: lesson for module in course.modules for lesson in module.lessons}
    requested_lesson_ids = [lesson.id for item in payload.modules for lesson in item.lessons]
    if len(requested_lesson_ids) != len(set(requested_lesson_ids)) or set(requested_lesson_ids) != set(lessons_by_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Reorder must include each course lesson exactly once')

    changed_modules: list[Module] = []
    changed_lessons: list[Lesson] = []
    for module_order, item in enumerate(payload.modules, start=1):
        module = modules_by_id[item.id]
        if module.order != module_order:
            module.order = module_order
            changed_modules.append(module)
        for lesson_order, lesson_item in enumerate(item.lessons, start=1):
            lesson = lessons_by_id[lesson_item.id]
            if lesson.module_id != module.id or lesson.order != lesson_order:
                lesson.module_id = module.id
                lesson.order = lesson_order
                changed_lessons.append(lesson)

    previous_revision = course.structure_revision
    course.structure_revision += 1
    await write_audit_log(db, admin.id, 'reordered', 'course', course.id, course.title,
                          {'structure_revision': {'from': previous_revision, 'to': course.structure_revision},
                           'changed_module_ids': [str(module.id) for module in changed_modules],
                           'changed_lesson_ids': [str(lesson.id) for lesson in changed_lessons]},
                          affected_ids=[course.id, *requested_module_ids, *requested_lesson_ids])
    await db.commit()
    refreshed = await _course_with_content(db, course_id)
    metrics = await _course_metrics(db, [course_id])
    modules = sorted(refreshed.modules, key=lambda module: module.order)
    module_values = [
        {**module.__dict__, 'lessons': [{**lesson.__dict__, 'completed': False} for lesson in sorted(module.lessons, key=lambda lesson: lesson.order)]}
        for module in modules
    ]
    return AdminCourseDetailResponse.model_validate({**_course_summary(refreshed, metrics.get(course_id)), 'modules': module_values})

async def create_module(
    course_id: UUID,
    payload: ModuleWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ModuleResponse:
    await _get_or_404(db, Course, course_id, 'Course')
    module = Module(course_id=course_id, **payload.model_dump())
    db.add(module)
    await db.flush()
    await _bump_structure_revision(db, course_id)
    await write_audit_log(db, admin.id, 'created', 'module', module.id, module.title)
    await db.commit()
    return ModuleResponse.model_validate({**module.__dict__, 'lessons': []})

async def update_module(
    course_id: UUID,
    module_id: UUID,
    payload: ModulePatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ModuleResponse:
    course = await db.scalar(select(Course).where(Course.id == course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    module = await db.scalar(select(Module).where(Module.id == module_id).with_for_update())
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    if module.course_id != course_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(module, changes.pop('expected_updated_at', None))
    order_changed = 'order' in changes and changes['order'] != module.order
    audit_changes = audit_field_changes(module, changes)
    for field, value in changes.items():
        setattr(module, field, value)
    if order_changed:
        await _bump_structure_revision(db, course_id)
    await write_audit_log(db, admin.id, 'updated', 'module', module.id, module.title, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(module)
    return ModuleResponse.model_validate({**module.__dict__, 'lessons': []})

async def delete_module(
    course_id: UUID,
    module_id: UUID,
    confirm_progress_loss: bool = False,
    confirm_title: str | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    course = await db.scalar(select(Course).where(Course.id == course_id).with_for_update())
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    module = await db.scalar(select(Module).where(Module.id == module_id).with_for_update())
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    if module.course_id != course_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Module not found')
    impact = await _module_impact(db, module)
    _require_destructive_confirmation(
        course.status == CourseStatus.published or impact.learners_with_progress > 0,
        module.title,
        confirm_progress_loss,
        confirm_title,
    )
    await _bump_structure_revision(db, course_id)
    lesson_ids = list((await db.scalars(select(Lesson.id).where(Lesson.module_id == module.id))).all())
    await write_audit_log(db, admin.id, 'deleted', 'module', module.id, module.title, affected_ids=[course_id, module.id, *lesson_ids])
    await db.delete(module)
    await db.flush()
    await refresh_course_progress_for_course(db, course_id)
    await db.commit()
