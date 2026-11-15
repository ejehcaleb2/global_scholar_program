from __future__ import annotations

import re
import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import rate_limit
from app.core.config import get_settings
from app.core.content import write_audit_log
from app.core.storage import storage_backend
from app.core.images import ImageValidationError, prepare_upload, store_image
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.gsp_models import User

admin_router = APIRouter(prefix='/admin', tags=['admin-media'])
public_router = APIRouter(tags=['media'])
PUBLIC_IMAGE_NAME = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)\Z')


class MediaUploadResponse(BaseModel):
    url: str


@admin_router.post('/media', response_model=MediaUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_admin_media(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MediaUploadResponse:
    await rate_limit.check([(rate_limit.rule('admin_upload'), str(admin.id))], consume=True)
    try:
        image = await prepare_upload(file, 'public')
    except ImageValidationError as exc:
        raise HTTPException(exc.status_code, detail={'code': exc.code, 'message': str(exc), **exc.details}) from exc
    storage_key = await store_image(storage_backend, image, public=True)

    filename = PurePosixPath(storage_key).name
    try:
        await write_audit_log(db, admin.id, 'upload', 'media', uuid.UUID(filename.rsplit('.', 1)[0]), filename)
        await db.commit()
    except Exception:
        await db.rollback()
        await storage_backend.delete(storage_key)
        raise
    settings = get_settings()
    return MediaUploadResponse(url=f'{settings.API_BASE_URL.rstrip("/")}/media/public/{filename}')


@public_router.get('/media/public/{filename}')
async def get_public_media(filename: str) -> StreamingResponse:
    if PUBLIC_IMAGE_NAME.fullmatch(filename) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Media not found')
    try:
        stream = await storage_backend.open_public(filename)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Media not found') from exc

    content_type = {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}[filename.rsplit('.', 1)[1]]
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        },
    )
