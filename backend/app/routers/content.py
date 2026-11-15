from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import nullslast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.content import opportunity_status
from app.core.masterclass import is_masterclass_past
from app.core.progress import build_progress, course_progress_for_courses
from app.db.session import get_db
from app.dependencies.auth import get_optional_user, require_authenticated
from app.dependencies.membership import get_membership_tier
from app.models.gsp_models import Course, CourseStatus, LessonProgress, Masterclass, Module, Opportunity, Resource, ResourceStatus, User
from app.schemas.content import (
    CourseDetailResponse,
    CourseSummaryResponse,
    OpportunityResponse,
    ResourceResponse,
)
from app.schemas.masterclass import MasterclassResponse

router = APIRouter(tags=['content'])


@router.get('/courses', response_model=list[CourseSummaryResponse])
async def list_courses(
    current_user: User | None = Depends(get_optional_user),
    membership_tier: Literal['free', 'paid'] = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> list[CourseSummaryResponse]:
    courses = (
        await db.scalars(
            select(Course)
            .options(selectinload(Course.modules).selectinload(Module.lessons))
            .where(Course.status == CourseStatus.published)
            .order_by(Course.created_at.desc())
        )
    ).all()
    progress_by_course = await course_progress_for_courses(db, current_user.id, [course.id for course in courses]) if current_user else {}
    responses = []
    for course in courses:
        progress = progress_by_course.get(course.id)
        lessons = [lesson for module in course.modules for lesson in module.lessons]
        responses.append(
            CourseSummaryResponse.model_validate(
                {
                    **course.__dict__,
                    'module_count': len(course.modules),
                    'lesson_count': len(lessons),
                    'duration_minutes': sum(lesson.duration_minutes for lesson in lessons),
                    'locked': course.access_type.value == 'members_only' and membership_tier == 'free',
                    'progress': progress,
                }
            )
        )
    return responses


@router.get('/courses/{course_id}', response_model=CourseDetailResponse)
async def get_course(
    course_id: UUID,
    current_user: User = Depends(require_authenticated),
    membership_tier: Literal['free', 'paid'] = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> CourseDetailResponse:
    course = await db.scalar(
        select(Course)
        .options(selectinload(Course.modules).selectinload(Module.lessons))
        .where(Course.id == course_id)
    )
    if course is None or course.status != CourseStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Course not found')
    if course.access_type.value == 'members_only' and membership_tier == 'free':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Paid membership required')
    lessons = [lesson for module in course.modules for lesson in module.lessons]
    completed_lesson_ids = set(
        (
            await db.scalars(
                select(LessonProgress.lesson_id).where(
                    LessonProgress.user_id == current_user.id,
                    LessonProgress.completed_at.is_not(None),
                    LessonProgress.lesson_id.in_([lesson.id for lesson in lessons]),
                )
            )
        ).all()
    )
    progress = build_progress(len(completed_lesson_ids), len(lessons))
    return CourseDetailResponse.model_validate(
        {
            **course.__dict__,
            'module_count': len(course.modules),
            'lesson_count': len(lessons),
            'duration_minutes': sum(lesson.duration_minutes for lesson in lessons),
            'modules': [
                {
                    **module.__dict__,
                    'lessons': [
                        {**lesson.__dict__, 'completed': lesson.id in completed_lesson_ids}
                        for lesson in module.lessons
                    ],
                }
                for module in course.modules
            ],
            'progress': progress,
        }
    )


@router.get('/resources', response_model=list[ResourceResponse])
async def list_resources(
    category: str | None = Query(default=None),
    current_user: User | None = Depends(get_optional_user),
    membership_tier: Literal['free', 'paid'] = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> list[ResourceResponse]:
    query = select(Resource).where(Resource.status == ResourceStatus.published)
    if category is not None:
        query = query.where(Resource.category == category)
    if membership_tier == 'free':
        query = query.where(Resource.access_type == 'free')
    resources = (await db.scalars(query.order_by(Resource.created_at.desc()))).all()
    return [ResourceResponse.model_validate({**resource.__dict__, 'locked': current_user is None,
                                            'url': resource.url if current_user else None}) for resource in resources]


@router.get('/opportunities', response_model=list[OpportunityResponse])
async def list_opportunities(
    current_user: User | None = Depends(get_optional_user),
    membership_tier: Literal['free', 'paid'] = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> list[OpportunityResponse]:
    query = select(Opportunity).order_by(nullslast(Opportunity.deadline.asc()))
    if membership_tier == 'free':
        query = query.limit(4)
    opportunities = (await db.scalars(query)).all()
    return [
        OpportunityResponse.model_validate(
            {**opportunity.__dict__, 'status': opportunity_status(opportunity.deadline),
             'locked': current_user is None, 'external_link': opportunity.external_link if current_user else None}
        )
        for opportunity in opportunities
    ]


@router.get('/masterclasses', response_model=list[MasterclassResponse])
async def list_masterclasses(
    current_user: User | None = Depends(get_optional_user),
    membership_tier: Literal['free', 'paid'] = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> list[MasterclassResponse]:
    masterclasses = (
        await db.scalars(
            select(Masterclass).order_by(Masterclass.session_datetime.asc())
        )
    ).all()
    responses = []
    for masterclass in masterclasses:
        locked = current_user is None or (masterclass.access_type.value == 'members_only' and membership_tier == 'free')
        responses.append(
            MasterclassResponse.model_validate(
                {
                    **masterclass.__dict__,
                    'session_link': None if locked else masterclass.session_link,
                    'recording_url': None if locked else masterclass.recording_url,
                    'is_past': is_masterclass_past(masterclass.session_datetime),
                    'locked': locked,
                }
            )
        )
    return responses
