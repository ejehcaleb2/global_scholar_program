from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.progress import persist_course_progress
from app.db.session import get_db
from app.dependencies.auth import require_authenticated
from app.dependencies.membership import get_membership_tier
from app.models.gsp_models import CourseStatus, Lesson, LessonProgress, Module, User
from app.schemas.content import LessonCompletionResponse

router = APIRouter(tags=['progress'])


async def _accessible_lesson(
    lesson_id: UUID,
    membership_tier: str,
    db: AsyncSession,
) -> Lesson:
    lesson = await db.scalar(
        select(Lesson)
        .options(selectinload(Lesson.module).selectinload(Module.course))
        .where(Lesson.id == lesson_id)
    )
    if lesson is None or lesson.module.course.status != CourseStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lesson not found')
    if lesson.module.course.access_type.value == 'members_only' and membership_tier == 'free':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Paid membership required')
    return lesson


@router.post('/lessons/{lesson_id}/complete', response_model=LessonCompletionResponse)
async def complete_lesson(
    lesson_id: UUID,
    current_user: User = Depends(require_authenticated),
    membership_tier: str = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> LessonCompletionResponse:
    lesson = await _accessible_lesson(lesson_id, membership_tier, db)
    progress = await db.scalar(
        select(LessonProgress).where(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id == lesson.id,
        )
    )
    if progress is None:
        db.add(LessonProgress(user_id=current_user.id, lesson_id=lesson.id, completed_at=datetime.now(timezone.utc)))
    elif progress.completed_at is None:
        progress.completed_at = datetime.now(timezone.utc)

    snapshot = await persist_course_progress(db, current_user.id, lesson.module.course.id)
    await db.commit()
    return LessonCompletionResponse(lesson_id=lesson.id, completed=True, progress=snapshot)


@router.delete('/lessons/{lesson_id}/complete', response_model=LessonCompletionResponse)
async def uncomplete_lesson(
    lesson_id: UUID,
    current_user: User = Depends(require_authenticated),
    membership_tier: str = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> LessonCompletionResponse:
    lesson = await _accessible_lesson(lesson_id, membership_tier, db)
    await db.execute(
        delete(LessonProgress).where(
            LessonProgress.user_id == current_user.id,
            LessonProgress.lesson_id == lesson.id,
        )
    )
    snapshot = await persist_course_progress(db, current_user.id, lesson.module.course.id)
    await db.commit()
    return LessonCompletionResponse(lesson_id=lesson.id, completed=False, progress=snapshot)
