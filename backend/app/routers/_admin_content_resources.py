"""Admin resources endpoints; registered in admin_content."""

from sqlalchemy import func
from app.schemas.pagination import PageResponse

from ._admin_content_common import (
    AsyncSession,
    Depends,
    Query,
    Resource,
    ResourcePatch,
    ResourceResponse,
    ResourceStatus,
    ResourceWrite,
    UUID,
    User,
    _get_or_404,
    _require_current_version,
    audit_field_changes,
    get_db,
    require_admin,
    router,
    select,
    status,
    write_audit_log,
)


async def list_admin_resources(
    resource_status: ResourceStatus | None = Query(default=None, alias='status'),
    category: str | None = Query(default=None, max_length=100),
    search: str | None = Query(default=None, max_length=255),
    paginated: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[ResourceResponse] | PageResponse[ResourceResponse]:
    query = select(Resource).order_by(Resource.created_at.desc(), Resource.id.desc())
    if resource_status is not None:
        query = query.where(Resource.status == resource_status)
    if category:
        query = query.where(Resource.category == category)
    if search:
        query = query.where(Resource.title.ilike(f'%{search}%'))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) if paginated else None
    if paginated:
        query = query.limit(limit).offset(offset)
    resources = (await db.scalars(query)).all()
    items = [ResourceResponse.model_validate(resource) for resource in resources]
    return PageResponse(items=items, total=total or 0, limit=limit, offset=offset) if paginated else items

async def create_resource(
    payload: ResourceWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ResourceResponse:
    resource = Resource(**payload.model_dump())
    db.add(resource)
    await db.flush()
    await write_audit_log(db, admin.id, 'created', 'resource', resource.id, resource.title)
    await db.commit()
    return ResourceResponse.model_validate(resource)

async def update_resource(
    resource_id: UUID,
    payload: ResourcePatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ResourceResponse:
    resource = await _get_or_404(db, Resource, resource_id, 'Resource', lock=True)
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(resource, changes.pop('expected_updated_at', None))
    audit_changes = audit_field_changes(resource, changes)
    for field, value in changes.items():
        setattr(resource, field, value)
    action = 'status_change' if 'status' in changes else 'update'
    await write_audit_log(db, admin.id, action, 'resource', resource.id, resource.title, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(resource)
    return ResourceResponse.model_validate(resource)

async def delete_resource(
    resource_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    resource = await _get_or_404(db, Resource, resource_id, 'Resource')
    await write_audit_log(db, admin.id, 'deleted', 'resource', resource.id, resource.title)
    await db.delete(resource)
    await db.commit()
