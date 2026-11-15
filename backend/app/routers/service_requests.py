from __future__ import annotations

from uuid import UUID
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from app.schemas.pagination import PageResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core import rate_limit
from app.core.content import write_audit_log
from app.core.storage import UploadValidationError, extension_for_type, sniff_content_type, storage_backend
from app.core.images import ImageValidationError
from app.db.session import get_db
from app.dependencies.auth import require_admin, require_authenticated
from app.dependencies.membership import get_membership_tier
from app.models.gsp_models import ServiceRequest, ServiceRequestEvent, ServiceStatus, ServiceType, User
from app.schemas.service_request import ServiceRequestAdminResponse, ServiceRequestDetailResponse, ServiceRequestResponse, ServiceRequestStatusUpdate

router = APIRouter(tags=['service-requests'])


def _admin_response(request: ServiceRequest) -> ServiceRequestAdminResponse:
    return ServiceRequestAdminResponse.model_validate(
        {
            **request.__dict__,
            'student': {
                'id': request.user.id,
                'full_name': request.user.profile.full_name if request.user.profile else None,
                'email': request.user.email,
            },
        }
    )

ALLOWED_TRANSITIONS = {
    ServiceStatus.submitted: ServiceStatus.in_progress,
    ServiceStatus.in_progress: ServiceStatus.returned,
}


@router.post('/service-requests', response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_service_request(
    service_type: ServiceType = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(require_authenticated),
    membership_tier: str = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> ServiceRequestResponse:
    if membership_tier != 'paid':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Paid membership required')

    await rate_limit.check([(rate_limit.rule('service_upload'), str(current_user.id))], consume=True)
    try:
        storage_key = await storage_backend.save(file)
    except ImageValidationError as exc:
        raise HTTPException(exc.status_code, detail={'code': exc.code, 'message': str(exc), **exc.details}) from exc
    except UploadValidationError as exc:
        message = str(exc)
        response_status = status.HTTP_413_CONTENT_TOO_LARGE if '10MB' in message else status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
        raise HTTPException(status_code=response_status, detail=message) from exc

    request = ServiceRequest(
        user_id=current_user.id,
        service_type=service_type,
        document_url=storage_key,
        status=ServiceStatus.submitted,
    )
    db.add(request)
    try:
        await db.flush()
        db.add(
            ServiceRequestEvent(
                service_request_id=request.id,
                from_status=None,
                to_status=ServiceStatus.submitted,
                changed_by=current_user.id,
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
        await storage_backend.delete(storage_key)
        raise

    await db.refresh(request)
    return ServiceRequestResponse.model_validate(request)


@router.get('/service-requests', response_model=list[ServiceRequestResponse])
async def list_my_service_requests(
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceRequestResponse]:
    requests = (
        await db.scalars(
            select(ServiceRequest)
            .where(ServiceRequest.user_id == current_user.id)
            .order_by(ServiceRequest.created_at.desc())
        )
    ).all()
    return [ServiceRequestResponse.model_validate(request) for request in requests]


@router.get('/service-requests/{request_id}/document')
async def download_service_request_document(
    request_id: UUID,
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    request = await db.scalar(
        select(ServiceRequest)
        .options(joinedload(ServiceRequest.user).joinedload(User.profile))
        .where(ServiceRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Service request not found')
    if request.user_id != current_user.id and current_user.role.value != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Not allowed to access this document')
    if request.document_url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Document not found')
    try:
        stream = await storage_backend.open(request.document_url)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Document not found') from exc
    content = stream.read()
    content_type = sniff_content_type(content)
    if content_type is None:
        raise HTTPException(415, detail='Stored document type is not supported')
    filename = f'{request.service_type.value}-{str(request.id)[:8]}{extension_for_type(content_type)}'
    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
        },
    )


@router.get('/admin/service-requests', response_model=list[ServiceRequestAdminResponse] | PageResponse[ServiceRequestAdminResponse])
async def admin_service_request_queue(
    request_status: ServiceStatus | None = Query(default=None, alias='status'),
    pending: bool = False,
    user_id: UUID | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    paginated: bool = False,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceRequestAdminResponse] | PageResponse[ServiceRequestAdminResponse]:
    query = (
        select(ServiceRequest)
        .options(joinedload(ServiceRequest.user).joinedload(User.profile))
        .order_by(ServiceRequest.created_at.asc() if pending else ServiceRequest.created_at.desc(), ServiceRequest.id)
        .limit(limit)
        .offset(offset)
    )
    if request_status is not None:
        query = query.where(ServiceRequest.status == request_status)
    if pending:
        query = query.where(ServiceRequest.status.in_([ServiceStatus.submitted, ServiceStatus.in_progress]))
    if user_id is not None:
        query = query.where(ServiceRequest.user_id == user_id)
    total = await db.scalar(select(func.count()).select_from(query.limit(None).offset(None).order_by(None).subquery())) if paginated else None
    requests = (await db.scalars(query)).all()
    items = [_admin_response(request) for request in requests]

    return PageResponse(items=items, total=total or 0, limit=limit, offset=offset) if paginated else items


@router.get('/admin/service-requests/{request_id}', response_model=ServiceRequestDetailResponse)
async def admin_service_request_detail(
    request_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ServiceRequestDetailResponse:
    request = await db.scalar(
        select(ServiceRequest)
        .options(
            joinedload(ServiceRequest.user).joinedload(User.profile),
            selectinload(ServiceRequest.events)
            .joinedload(ServiceRequestEvent.changed_by_user).joinedload(User.profile),
        )
        .where(ServiceRequest.id == request_id)
    )
    if request is None:
        raise HTTPException(status_code=404, detail='Service request not found')
    return ServiceRequestDetailResponse(
        **_admin_response(request).model_dump(),
        has_document=request.document_url is not None,
        events=[{
            'from_status': entry.from_status,
            'to_status': entry.to_status,
            'changed_at': entry.changed_at,
            'actor': {
                'id': entry.changed_by_user.id,
                'full_name': entry.changed_by_user.profile.full_name if entry.changed_by_user.profile else None,
                'email': entry.changed_by_user.email,
            },
        } for entry in sorted(request.events, key=lambda item: (item.changed_at, str(item.id)))],
    )

@router.patch('/admin/service-requests/{request_id}/status', response_model=ServiceRequestAdminResponse)
async def update_service_request_status(
    request_id: UUID,
    payload: ServiceRequestStatusUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ServiceRequestAdminResponse:
    request = await db.scalar(
        select(ServiceRequest)
        .options(joinedload(ServiceRequest.user).joinedload(User.profile))
        .where(ServiceRequest.id == request_id)
        .with_for_update(of=ServiceRequest)
    )
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Service request not found')
    if ALLOWED_TRANSITIONS.get(request.status) != payload.status:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid service request status transition')

    previous_status = request.status
    request.status = payload.status
    db.add(
        ServiceRequestEvent(
            service_request_id=request.id,
            from_status=previous_status,
            to_status=payload.status,
            changed_by=admin.id,
        )
    )
    await write_audit_log(db, admin.id, 'status_change', 'service_request', request.id,
                          request.user.profile.full_name if request.user.profile else str(request.user_id),
                          {'status': {'from': previous_status.value, 'to': request.status.value}})
    await db.commit()
    return _admin_response(request)
