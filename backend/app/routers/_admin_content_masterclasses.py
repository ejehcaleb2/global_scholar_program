"""Admin masterclasses endpoints; registered in admin_content."""

from sqlalchemy import func
from app.schemas.pagination import PageResponse

from ._admin_content_common import (
    AsyncSession,
    Depends,
    Masterclass,
    MasterclassPatch,
    MasterclassResponse,
    MasterclassWrite,
    Query,
    UUID,
    User,
    _get_or_404,
    _require_current_version,
    audit_field_changes,
    get_db,
    is_masterclass_past,
    require_admin,
    router,
    select,
    status,
    write_audit_log,
)


async def list_admin_masterclasses(
    search: str | None = Query(default=None, max_length=255),
    paginated: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[MasterclassResponse] | PageResponse[MasterclassResponse]:
    query = select(Masterclass).order_by(Masterclass.session_datetime.asc(), Masterclass.id.asc())
    if search:
        query = query.where(Masterclass.title.ilike(f'%{search}%'))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) if paginated else None
    if paginated:
        query = query.limit(limit).offset(offset)
    masterclasses = (await db.scalars(query)).all()
    items = [
        MasterclassResponse.model_validate(
            {**masterclass.__dict__, 'is_past': is_masterclass_past(masterclass.session_datetime), 'locked': False}
        )
        for masterclass in masterclasses
    ]
    return PageResponse(items=items, total=total or 0, limit=limit, offset=offset) if paginated else items

async def create_masterclass(
    payload: MasterclassWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MasterclassResponse:
    masterclass = Masterclass(**payload.model_dump())
    db.add(masterclass)
    await db.flush()
    await write_audit_log(db, admin.id, 'created', 'masterclass', masterclass.id, masterclass.title)
    await db.commit()
    return MasterclassResponse.model_validate(
        {**masterclass.__dict__, 'is_past': is_masterclass_past(masterclass.session_datetime), 'locked': False}
    )

async def update_masterclass(
    masterclass_id: UUID,
    payload: MasterclassPatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MasterclassResponse:
    masterclass = await _get_or_404(db, Masterclass, masterclass_id, 'Masterclass', lock=True)
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(masterclass, changes.pop('expected_updated_at', None))
    audit_changes = audit_field_changes(masterclass, changes)
    for field, value in changes.items():
        setattr(masterclass, field, value)
    action = 'status_change' if 'access_type' in changes else 'update'
    await write_audit_log(db, admin.id, action, 'masterclass', masterclass.id, masterclass.title, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(masterclass)
    return MasterclassResponse.model_validate(
        {**masterclass.__dict__, 'is_past': is_masterclass_past(masterclass.session_datetime), 'locked': False}
    )

async def delete_masterclass(
    masterclass_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    masterclass = await _get_or_404(db, Masterclass, masterclass_id, 'Masterclass')
    await write_audit_log(db, admin.id, 'deleted', 'masterclass', masterclass.id, masterclass.title)
    await db.delete(masterclass)
    await db.commit()
