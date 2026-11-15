from datetime import datetime, timedelta, timezone
from math import isfinite
from typing import Literal
from uuid import uuid4

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
# Publicly unusable precomputed verifier for unknown-account timing parity.
DUMMY_PASSWORD_HASH = '$2b$12$x1nBLoSTKyUFPAlO0P1T0.n3MFch5HcHgbIJJDzsXaD0jnjdBHOZ2'



def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _create_token(subject: str, token_type: Literal['access', 'refresh'], lifetime: timedelta) -> str:
    issued_at = int(datetime.now(timezone.utc).timestamp() * 1000) / 1000
    claims = {
        'sub': subject,
        'type': token_type,
        'iat': issued_at,
        'jti': str(uuid4()),
        'exp': issued_at + lifetime.total_seconds(),
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    lifetime = expires_delta if expires_delta is not None else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _create_token(subject, 'access', lifetime)


def create_refresh_token(subject: str, expires_delta: timedelta | None = None) -> str:
    lifetime = expires_delta if expires_delta is not None else timedelta(days=7)
    return _create_token(subject, 'refresh', lifetime)


def decode_access_token(token: str, expected_type: Literal['access', 'refresh'] = 'access') -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={'require': ['exp', 'iat', 'sub', 'jti', 'type']},
        )
        if payload['type'] != expected_type or not payload['sub'] or not payload['jti']:
            raise ValueError('Invalid token')
        if isinstance(payload['iat'], bool) or not isinstance(payload['iat'], (int, float)) or not isfinite(payload['iat']):
            raise ValueError('Invalid token')
        return payload
    except (jwt.PyJWTError, TypeError, ValueError, OverflowError) as exc:
        raise ValueError('Invalid token') from exc


def token_is_current(payload: dict, user) -> bool:
    """Check database state, comparing both timestamps at millisecond precision."""
    issued_at = payload.get('iat')
    if not user.is_active or isinstance(issued_at, bool) or not isinstance(issued_at, (int, float)) or not isfinite(issued_at):
        return False
    cutoff = user.token_valid_after
    if cutoff is None:
        return True
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)
    return round(float(issued_at), 3) >= round(cutoff.timestamp(), 3)
