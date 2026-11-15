from uuid import UUID
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case

from app.core.password_policy import validate_password
from app.core import rate_limit
from app.core.images import ImageValidationError, delete_avatar, prepare_upload, store_image, thumbnail_key
from app.core.security import create_access_token, create_refresh_token, get_password_hash, verify_password
from app.core.storage import storage_backend
from app.db.session import get_db
from app.dependencies.auth import require_authenticated
from app.dependencies.membership import active_subscription_criteria, get_membership_tier
from app.models.gsp_models import Profile, Subscription, User, UserRole
from app.schemas.auth import TokenResponse
from app.schemas.profile import AvatarUploadResponse, EmailChangeRequest, MembershipResponse, PasswordChangeRequest, PasswordChangeResponse, ProfilePatch, ProfileResponse

router = APIRouter(tags=['profile'])


@router.get('/membership')
async def get_membership_status(
    current_user: User = Depends(require_authenticated),
    membership_tier: str = Depends(get_membership_tier),
    db: AsyncSession = Depends(get_db),
) -> MembershipResponse:
    subscription = await db.scalar(
        select(Subscription)
        .where(Subscription.user_id == current_user.id)
        .order_by(case((and_(*active_subscription_criteria(current_user.id, datetime.now(timezone.utc))), 0), else_=1), Subscription.created_at.desc())
        .limit(1)
    )
    return MembershipResponse(
        tier=membership_tier,
        plan=subscription.plan if subscription else None,
        status=subscription.status if subscription else None,
        current_period_end=subscription.current_period_end if subscription else None,
    )


@router.get('/profile', response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    profile = await db.get(Profile, current_user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Profile not found')
    return ProfileResponse.model_validate(profile)


@router.patch('/profile', response_model=ProfileResponse)
async def update_profile(
    payload: ProfilePatch,
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    profile = await db.get(Profile, current_user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Profile not found')

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return ProfileResponse.model_validate(profile)


@router.post('/profile/email', response_model=ProfileResponse)
async def update_profile_email(
    payload: EmailChangeRequest,
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    entries = [(rate_limit.rule('email_user'), str(current_user.id))]
    async with rate_limit.failure_lock:
        await rate_limit.check(entries)
        if not verify_password(payload.current_password, current_user.hashed_password):
            await rate_limit.record_failure(entries)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid current password')

    new_email = payload.new_email.strip().lower()
    existing_user = await db.scalar(
        select(User).where(func.lower(User.email) == new_email, User.id != current_user.id)
    )
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='An account with this email already exists')

    current_user.email = new_email
    await db.commit()
    await db.refresh(current_user)

    profile = await db.get(Profile, current_user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Profile not found')

    return ProfileResponse.model_validate(profile)


@router.post('/profile/password', response_model=PasswordChangeResponse)
async def update_profile_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> PasswordChangeResponse:
    entries = [(rate_limit.rule('password_user'), str(current_user.id))]
    async with rate_limit.failure_lock:
        await rate_limit.check(entries)
        if not verify_password(payload.current_password, current_user.hashed_password):
            await rate_limit.record_failure(entries)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid current password')

    profile = await db.get(Profile, current_user.id)
    validate_password(payload.new_password, current_user.email, profile.full_name if profile else None, field='new_password')
    current_user.hashed_password = get_password_hash(payload.new_password)
    changed_at = datetime.now(timezone.utc)
    current_user.token_valid_after = changed_at.replace(microsecond=(changed_at.microsecond // 1000) * 1000)
    await db.commit()
    return PasswordChangeResponse(tokens=TokenResponse(
        access_token=create_access_token(str(current_user.id)),
        refresh_token=create_refresh_token(str(current_user.id)),
    ))


@router.post('/profile/avatar', response_model=AvatarUploadResponse)
async def upload_profile_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> AvatarUploadResponse:
    await rate_limit.check([(rate_limit.rule('avatar_upload'), str(current_user.id))], consume=True)
    profile = await db.get(Profile, current_user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Profile not found')
    try:
        image = await prepare_upload(file, 'avatar')
    except ImageValidationError as exc:
        raise HTTPException(exc.status_code, detail={'code': exc.code, 'message': str(exc), **exc.details}) from exc
    storage_key = await store_image(storage_backend, image)
    previous_key = profile.avatar_url
    try:
        profile.avatar_url = storage_key
        await db.flush()
        await db.refresh(profile)
        await db.commit()
    except BaseException:
        await db.rollback()
        await delete_avatar(storage_backend, storage_key)
        raise
    if previous_key and previous_key != storage_key:
        await delete_avatar(storage_backend, previous_key)
    return AvatarUploadResponse(avatar_url=profile.avatar_url, updated_at=profile.updated_at)


@router.get('/profile/avatar/{user_id}')
async def get_profile_avatar(
    user_id: UUID,
    size: Literal['96', '512'] = '512',
    current_user: User = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Avatar not found')

    profile = await db.get(Profile, user_id)
    if profile is None or not profile.avatar_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Avatar not found')

    extension = profile.avatar_url.rsplit('.', 1)[-1].lower()
    media_type = {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}.get(extension)
    if media_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Avatar not found')

    try:
        stream = await storage_backend.open(thumbnail_key(profile.avatar_url) if size == '96' else profile.avatar_url)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Avatar not found') from exc

    return StreamingResponse(
        stream,
        media_type=media_type,
        headers={
            'Content-Disposition': f'inline; filename="avatar.{extension}"',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=300',
            'Vary': 'Authorization',
        },
    )
