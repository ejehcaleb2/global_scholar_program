"""Admin opportunities endpoints; registered in admin_content."""

from sqlalchemy import func
from app.schemas.pagination import PageResponse

from ._admin_content_common import (
    AsyncSession,
    Depends,
    Opportunity,
    OpportunityPatch,
    OpportunityResponse,
    OpportunityWrite,
    Query,
    UUID,
    User,
    _get_or_404,
    _require_current_version,
    audit_field_changes,
    get_db,
    nullslast,
    opportunity_status,
    require_admin,
    router,
    select,
    status,
    write_audit_log,
)


async def list_admin_opportunities(
    search: str | None = Query(default=None, max_length=255),
    paginated: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[OpportunityResponse] | PageResponse[OpportunityResponse]:
    query = select(Opportunity).order_by(nullslast(Opportunity.deadline.asc()), Opportunity.created_at.desc(), Opportunity.id.desc())
    if search:
        query = query.where(Opportunity.name.ilike(f'%{search}%'))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) if paginated else None
    if paginated:
        query = query.limit(limit).offset(offset)
    opportunities = (await db.scalars(query)).all()
    items = [
        OpportunityResponse.model_validate(
            {**opportunity.__dict__, 'status': opportunity_status(opportunity.deadline)}
        )
        for opportunity in opportunities
    ]
    return PageResponse(items=items, total=total or 0, limit=limit, offset=offset) if paginated else items

async def create_opportunity(
    payload: OpportunityWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    opportunity = Opportunity(created_by=admin.id, **payload.model_dump())
    db.add(opportunity)
    await db.flush()
    await write_audit_log(db, admin.id, 'created', 'opportunity', opportunity.id, opportunity.name)
    await db.commit()
    return OpportunityResponse.model_validate({**opportunity.__dict__, 'status': opportunity_status(opportunity.deadline)})

async def update_opportunity(
    opportunity_id: UUID,
    payload: OpportunityPatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    opportunity = await _get_or_404(db, Opportunity, opportunity_id, 'Opportunity', lock=True)
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(opportunity, changes.pop('expected_updated_at', None))
    audit_changes = audit_field_changes(opportunity, changes)
    for field, value in changes.items():
        setattr(opportunity, field, value)
    await write_audit_log(db, admin.id, 'updated', 'opportunity', opportunity.id, opportunity.name, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(opportunity)
    return OpportunityResponse.model_validate({**opportunity.__dict__, 'status': opportunity_status(opportunity.deadline)})

async def delete_opportunity(
    opportunity_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    opportunity = await _get_or_404(db, Opportunity, opportunity_id, 'Opportunity')
    await write_audit_log(db, admin.id, 'deleted', 'opportunity', opportunity.id, opportunity.name)
    await db.delete(opportunity)
    await db.commit()
