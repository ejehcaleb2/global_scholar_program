from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.dependencies.membership import active_subscription_criteria
from app.models.gsp_models import (
    AuditLog,
    Course,
    CourseStatus,
    ServiceRequest,
    ServiceStatus,
    Subscription,
    User,
    UserRole,
)
from app.schemas.admin import (
    AdminAuditFacetResponse,
    AdminAuditLogEnvelope,
    AdminAuditLogResponse,
    AdminCoursesStats,
    AdminServiceRequestStats,
    AdminSignupsStats,
    AdminStatsResponse,
    AdminStudentsStats,
)

router = APIRouter(prefix='/admin', tags=['admin'])


@router.get('/stats', response_model=AdminStatsResponse)
async def get_admin_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStatsResponse:
    now = datetime.now(timezone.utc)
    is_paid = (
        select(Subscription.id)
        .where(*active_subscription_criteria(User.id, now))
        .exists()
    )
    student_row = (
        await db.execute(
            select(
                func.count(User.id).label('total'),
                func.count(User.id).filter(is_paid).label('paid'),
                func.count(User.id)
                .filter(User.created_at >= now - timedelta(days=7))
                .label('last_7_days'),
            ).where(User.role == UserRole.student, User.is_active.is_(True))
        )
    ).one()
    service_rows = (
        await db.execute(
            select(ServiceRequest.status, func.count(ServiceRequest.id))
            .group_by(ServiceRequest.status)
        )
    ).all()
    course_rows = (
        await db.execute(
            select(Course.status, func.count(Course.id)).group_by(Course.status)
        )
    ).all()

    service_counts = {status: count for status, count in service_rows}
    course_counts = {status: count for status, count in course_rows}
    submitted = service_counts.get(ServiceStatus.submitted, 0)
    in_progress = service_counts.get(ServiceStatus.in_progress, 0)
    total_students = student_row.total
    paid_students = student_row.paid
    return AdminStatsResponse(
        students=AdminStudentsStats(total=total_students, paid=paid_students, free=total_students - paid_students),
        signups=AdminSignupsStats(last_7_days=student_row.last_7_days),
        service_requests=AdminServiceRequestStats(
            pending=submitted + in_progress,
            submitted=submitted,
            in_progress=in_progress,
            returned=service_counts.get(ServiceStatus.returned, 0),
        ),
        courses=AdminCoursesStats(
            published=course_counts.get(CourseStatus.published, 0),
            draft=course_counts.get(CourseStatus.draft, 0),
        ),
    )


def _audit_actor_payload(log: AuditLog) -> dict:
    profile = getattr(log.actor, 'profile', None)
    return {
        'id': log.actor.id,
        'full_name': profile.full_name if profile else None,
        'email': log.actor.email,
        'avatar_url': profile.avatar_url if profile else None,
        'updated_at': profile.updated_at if profile else None,
    }


@router.get('/audit-logs', response_model=AdminAuditLogEnvelope)
async def list_admin_audit_logs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    actor_id: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str = Query(default='desc', pattern='^(asc|desc)$'),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='date_from must be before or equal to date_to')

    query = select(AuditLog).options(joinedload(AuditLog.actor).joinedload(User.profile))
    count_query = select(func.count()).select_from(AuditLog)

    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
        count_query = count_query.where(AuditLog.actor_id == actor_id)
    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
        count_query = count_query.where(AuditLog.entity_id == entity_id)
    if q:
        q_value = q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        pattern = f'%{q_value}%'
        query = query.where(or_(func.lower(AuditLog.entity_id).like(func.lower(pattern)), func.lower(func.cast(AuditLog.extra_data, String)).like(func.lower(pattern))))
        count_query = count_query.where(or_(func.lower(AuditLog.entity_id).like(func.lower(pattern)), func.lower(func.cast(AuditLog.extra_data, String)).like(func.lower(pattern))))
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
        count_query = count_query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)
        count_query = count_query.where(AuditLog.created_at <= date_to)

    total = (await db.scalar(count_query)) or 0
    order = AuditLog.created_at.asc() if sort == 'asc' else AuditLog.created_at.desc()
    rows = (await db.scalars(query.order_by(order).limit(limit).offset(offset))).unique().all()
    items = []
    for log in rows:
        label = (log.extra_data or {}).get('label') if isinstance(log.extra_data, dict) else None
        items.append(
            AdminAuditLogResponse.model_validate(
                {
                    **log.__dict__,
                    'label': label,
                    'actor': _audit_actor_payload(log),
                }
            )
        )
    return AdminAuditLogEnvelope(items=items, total=total, limit=limit, offset=offset)


@router.get('/audit-logs/facets', response_model=AdminAuditFacetResponse)
async def list_admin_audit_log_facets(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    actions = (await db.execute(select(AuditLog.action, func.count(AuditLog.id)).group_by(AuditLog.action).order_by(AuditLog.action.asc()))).all()
    entity_types = (await db.execute(select(AuditLog.entity_type, func.count(AuditLog.id)).group_by(AuditLog.entity_type).order_by(AuditLog.entity_type.asc()))).all()
    admins = (
        await db.execute(
            select(User.id, User.email, User.full_name if hasattr(User, 'full_name') else User.email)
            .where(User.role == 'admin')
            .order_by(User.email.asc())
        )
    ).all()
    return {
        'actions': [{'value': action, 'label': action} for action, _ in actions],
        'entity_types': [{'value': entity_type, 'label': entity_type} for entity_type, _ in entity_types],
        'admins': [{'value': str(admin_id), 'label': (admin_name or admin_email)} for admin_id, admin_email, admin_name in admins],
    }


@router.get('/audit-logs/{entry_id}', response_model=AdminAuditLogResponse)
async def get_admin_audit_log(
    entry_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAuditLogResponse:
    log = await db.scalar(
        select(AuditLog)
        .options(joinedload(AuditLog.actor).joinedload(User.profile))
        .where(AuditLog.id == entry_id)
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Audit log entry not found')
    label = (log.extra_data or {}).get('label') if isinstance(log.extra_data, dict) else None
    return AdminAuditLogResponse.model_validate({
        **log.__dict__,
        'label': label,
        'actor': _audit_actor_payload(log),
    })


