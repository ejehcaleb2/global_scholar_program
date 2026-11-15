import re

from app.core.common_passwords import COMMON_PASSWORDS


def password_error(password: str, email: str, name: str | None) -> str | None:
    size = len(password.encode('utf-8'))
    if not 10 <= size <= 72:
        return 'password_bytes'
    normalized = password.lower()
    if normalized in COMMON_PASSWORDS:
        return 'password_common'
    identifiers = [email.strip().lower().split('@')[0]]
    if name:
        identifiers.extend(re.split(r'\s+', name.strip().lower()))
        identifiers.append(name.strip().lower())
    if any(value and value in normalized for value in identifiers):
        return 'password_identity'
    return None


def validate_password(password: str, email: str, name: str | None, *, field: str) -> None:
    from fastapi import HTTPException
    error = password_error(password, email, name)
    if error:
        raise HTTPException(422, detail=[{'loc': ['body', field], 'msg': error, 'type': error}])
