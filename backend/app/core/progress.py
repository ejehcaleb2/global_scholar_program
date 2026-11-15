from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gsp_models import CourseProgress, Lesson, LessonProgress, Module
from app.schemas.content import CourseProgressResponse


async def course_progress_snapshot(
    db: AsyncSession,
    user_id: UUID,
    course_id: UUID,
) -> CourseProgressResponse:
    total_count = int(
        await db.scalar(
            select(func.count(Lesson.id))
            .join(Module, Lesson.module_id == Module.id)
            .where(Module.course_id == course_id)
        )
        or 0
    )
    completed_count = int(
        await db.scalar(
            select(func.count(LessonProgress.id))
            .join(Lesson, LessonProgress.lesson_id == Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .where(
                LessonProgress.user_id == user_id,
                LessonProgress.completed_at.is_not(None),
                Module.course_id == course_id,
            )
        )
        or 0
    )
    percent = round((completed_count / total_count) * 100) if total_count else 0
    return CourseProgressResponse(
        completed_count=completed_count,
        total_count=total_count,
        percent=percent,
    )


async def course_progress_for_courses(
    db: AsyncSession,
    user_id: UUID,
    course_ids: list[UUID],
) -> dict[UUID, CourseProgressResponse]:
    """Progress for many courses in two grouped queries instead of two per course."""
    if not course_ids:
        return {}
    totals = dict(
        (
            await db.execute(
                select(Module.course_id, func.count(Lesson.id))
                .join(Lesson, Lesson.module_id == Module.id)
                .where(Module.course_id.in_(course_ids))
                .group_by(Module.course_id)
            )
        ).all()
    )
    completed = dict(
        (
            await db.execute(
                select(Module.course_id, func.count(LessonProgress.id))
                .join(Lesson, Lesson.module_id == Module.id)
                .join(LessonProgress, LessonProgress.lesson_id == Lesson.id)
                .where(
                    Module.course_id.in_(course_ids),
                    LessonProgress.user_id == user_id,
                    LessonProgress.completed_at.is_not(None),
                )
                .group_by(Module.course_id)
            )
        ).all()
    )
    return {
        course_id: build_progress(int(completed.get(course_id, 0)), int(totals.get(course_id, 0)))
        for course_id in course_ids
    }


def build_progress(completed_count: int, total_count: int) -> CourseProgressResponse:
    percent = round((completed_count / total_count) * 100) if total_count else 0
    return CourseProgressResponse(completed_count=completed_count, total_count=total_count, percent=percent)


async def persist_course_progress(
    db: AsyncSession,
    user_id: UUID,
    course_id: UUID,
) -> CourseProgressResponse:
    snapshot = await course_progress_snapshot(db, user_id, course_id)
    progress = await db.scalar(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id,
            CourseProgress.course_id == course_id,
        )
    )
    if progress is None:
        progress = CourseProgress(user_id=user_id, course_id=course_id)
        db.add(progress)

    progress.completed_count = snapshot.completed_count
    progress.total_count = snapshot.total_count
    progress.percent = snapshot.percent
    progress.updated_at = datetime.now(timezone.utc)
    return snapshot


async def refresh_course_progress_for_course(db: AsyncSession, course_id: UUID) -> None:
    user_ids = set(
        (
            await db.scalars(
                select(CourseProgress.user_id).where(CourseProgress.course_id == course_id)
            )
        ).all()
    )
    user_ids.update(
        (
            await db.scalars(
                select(distinct(LessonProgress.user_id))
                .join(Lesson, LessonProgress.lesson_id == Lesson.id)
                .join(Module, Lesson.module_id == Module.id)
                .where(Module.course_id == course_id)
            )
        ).all()
    )
    for user_id in user_ids:
        await persist_course_progress(db, user_id, course_id)
