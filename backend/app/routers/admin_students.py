from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.schemas.pagination import PageResponse
from sqlalchemy import func, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.dependencies.membership import active_subscription_criteria
from app.models.gsp_models import Profile, Subscription, User, UserRole
from app.schemas.admin import AdminStudentDetailResponse, AdminStudentResponse

router = APIRouter(prefix='/admin', tags=['admin-students'])


def _paid_expression(now: datetime):
    return (
        select(Subscription.id)
        .where(*active_subscription_criteria(User.id, now))
        .exists()
    )


@router.get('/students', response_model=list[AdminStudentResponse] | PageResponse[AdminStudentResponse])
async def list_admin_students(
    search: str | None = Query(default=None, max_length=255),
    membership_tier: Literal['free', 'paid'] | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    paginated: bool = False,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AdminStudentResponse] | PageResponse[AdminStudentResponse]:
    now = datetime.now(timezone.utc)
    is_paid = _paid_expression(now)
    tier = case((is_paid, 'paid'), else_='free').label('membership_tier')
    query = (
        select(User, Profile.full_name, Profile.school, Profile.city, Profile.avatar_url, Profile.updated_at, tier)
        .outerjoin(Profile, Profile.user_id == User.id)
        .where(User.role == UserRole.student, User.is_active.is_(True))
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if search:
        pattern = f'%{search}%'
        query = query.where(or_(User.email.ilike(pattern), Profile.full_name.ilike(pattern)))
    if membership_tier:
        query = query.where(tier == membership_tier)

    total = await db.scalar(select(func.count()).select_from(query.limit(None).offset(None).order_by(None).subquery())) if paginated else None
    rows = (await db.execute(query)).all()
    items = [
        AdminStudentResponse(
            id=user.id,
            full_name=full_name,
            avatar_url=avatar_url,
            updated_at=updated_at,
            email=user.email,
            membership_tier=student_tier,
            created_at=user.created_at,
            school=school,
            city=city,
        )
        for user, full_name, school, city, avatar_url, updated_at, student_tier in rows
    ]

    return PageResponse(items=items, total=total or 0, limit=limit, offset=offset) if paginated else items

@router.get('/students/{student_id}', response_model=AdminStudentDetailResponse)
async def get_admin_student(
    student_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStudentDetailResponse:
    user = await db.scalar(
        select(User)
        .options(joinedload(User.profile))
        .where(User.id == student_id, User.role == UserRole.student, User.is_active.is_(True))
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Student not found')

    now = datetime.now(timezone.utc)
    is_paid = await db.scalar(
        select(Subscription.id).where(*active_subscription_criteria(user.id, now)).limit(1)
    )
    profile = user.profile
    return AdminStudentDetailResponse(
        id=user.id,
        full_name=profile.full_name if profile else None,
        avatar_url=profile.avatar_url if profile else None,
        updated_at=profile.updated_at if profile else None,
        email=user.email,
        membership_tier='paid' if is_paid else 'free',
        created_at=user.created_at,
        school=profile.school if profile else None,
        city=profile.city if profile else None,
        phone=profile.phone if profile else None,
        country=profile.country if profile else None,
        date_of_birth=profile.date_of_birth if profile else None,
        education_level=profile.education_level.value if profile and profile.education_level else None,
        fields_of_study=profile.fields_of_study if profile else None,
        countries_of_interest=profile.countries_of_interest if profile else None,
    )