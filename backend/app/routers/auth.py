from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
    verify_password,
    token_is_current,
)
from app.core.password_policy import validate_password
from app.core import rate_limit
from app.db.session import get_db
from app.models.gsp_models import Consent, ConsentType, Profile, User
from app.core.legal import LEGAL_VERSIONS
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RefreshResponse,
    SignupRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix='/auth', tags=['auth'])


def _invalid_login() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Invalid email or password',
        headers={'WWW-Authenticate': 'Bearer'},
    )


def _issue_tokens(user_id: UUID) -> TokenResponse:
    subject = str(user_id)
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.post('/signup', response_model=AuthResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit.dependency('signup_ip'))])
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    email = payload.email.strip().lower()
    await rate_limit.check([(rate_limit.rule('signup_email'), email)], consume=True)
    validate_password(payload.password, email, payload.full_name, field='password')
    existing_user = await db.scalar(select(User).where(func.lower(User.email) == email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='An account with this email already exists')

    user = User(email=email, hashed_password=get_password_hash(payload.password))
    profile = Profile(
        full_name=payload.full_name,
        phone=payload.phone,
        date_of_birth=payload.date_of_birth,
        country=payload.country,
    )
    user.profile = profile
    user.consents = [Consent(consent_type=ConsentType(kind), version=version) for kind, version in LEGAL_VERSIONS.items()]
    db.add(user)

    try:
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if getattr(exc.orig, 'sqlstate', None) != '23505':
            raise
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='An account with this email already exists') from exc

    await db.refresh(user)
    return AuthResponse(user=UserResponse.model_validate(user), tokens=_issue_tokens(user.id))


@router.post('/login', response_model=AuthResponse, dependencies=[Depends(rate_limit.dependency('login_ip'))])
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    email = payload.email.strip().lower()
    pair = rate_limit.client_ip(request) + ':' + email
    pair_rule = rate_limit.rule('login_pair')
    entries = [(pair_rule, pair), (rate_limit.rule('login_email'), email)]
    async with rate_limit.failure_lock:
        await rate_limit.check(entries)
        user = await db.scalar(select(User).where(func.lower(User.email) == email))
        password_matches = verify_password(payload.password, user.hashed_password if user else DUMMY_PASSWORD_HASH)
        if user is None or not password_matches or not user.is_active:
            await rate_limit.record_failure(entries)
            raise _invalid_login()
        await rate_limit.reset(pair_rule, pair)
    return AuthResponse(user=UserResponse.model_validate(user), tokens=_issue_tokens(user.id))


@router.post('/refresh', response_model=RefreshResponse, dependencies=[Depends(rate_limit.dependency('refresh_ip'))])
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> RefreshResponse:
    try:
        token_payload = decode_access_token(payload.refresh_token, expected_type='refresh')
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid refresh token') from exc

    if token_payload.get('type') != 'refresh' or not token_payload.get('sub'):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid refresh token')

    try:
        user_id = UUID(str(token_payload['sub']))
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid refresh token') from exc

    user = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None or not token_is_current(token_payload, user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid refresh token')

    return RefreshResponse(access_token=create_access_token(str(token_payload['sub'])))
