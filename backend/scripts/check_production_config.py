"""Run from backend/. Print check names and PASS/FAIL only, never settings."""
import os
from ipaddress import ip_address
from pathlib import Path
import sys
from urllib.parse import urlsplit

BACKEND = Path(__file__).resolve().parents[1]
PROJECT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from dotenv import dotenv_values
from sqlalchemy.engine import make_url
from app.core.config import Settings


def non_loopback(host: str | None) -> bool:
    if not host or 'localhost' in host.casefold():
        return False
    try:
        return not ip_address(host).is_loopback
    except ValueError:
        return True


def results(values: dict, *, docs_disabled: bool, uploads: Path, legal_directory: Path) -> dict[str, bool]:
    try:
        Settings.strong_jwt_secret(values.get('JWT_SECRET', ''))
        jwt_valid = True
    except Exception:
        jwt_valid = False
    try:
        url = make_url(values.get('DATABASE_URL', ''))
        user_valid = bool(url.username) and url.username.casefold() != 'postgres'
        host_valid = non_loopback(url.host)
    except Exception:
        user_valid = host_valid = False
    origins = [value.strip() for value in values.get('CORS_ORIGINS', '').split(',') if value.strip()]
    try:
        origins_valid = bool(origins) and all('*' not in value and non_loopback(urlsplit(value).hostname) for value in origins)
    except ValueError:
        origins_valid = False
    proxy = values.get('TRUSTED_PROXY_COUNT')
    files = [legal_directory / f'{document}.en.md' for document in ['terms', 'privacy']]
    try:
        legal_valid = all(file.is_file() for file in files) and all('PENDING_LEGAL_REVIEW' not in file.read_text(encoding='utf-8') for file in legal_directory.glob('*.md'))
    except OSError:
        legal_valid = False
    return {
        'APP_ENV': values.get('APP_ENV') == 'production',
        'JWT_SECRET': jwt_valid,
        'CORS_ORIGINS': origins_valid,
        'DATABASE_USER': user_valid,
        'DATABASE_HOST': host_valid,
        'LEGAL_REVIEW': legal_valid,
        'DOCS_DISABLED': docs_disabled,
        'UPLOADS_OUTSIDE_PROJECT': not uploads.resolve().is_relative_to(PROJECT.resolve()),
        'TRUSTED_PROXY_COUNT_EXPLICIT': proxy is not None and str(proxy).strip().isdigit(),
    }


def main() -> int:
    values = {key: value for key, value in {**dotenv_values(BACKEND / '.env'), **os.environ}.items() if value is not None}
    try:
        from app.main import app
        docs_disabled = app.docs_url is None and app.redoc_url is None and app.openapi_url is None
    except Exception:
        docs_disabled = False
    # Match LocalStorageBackend's actual source (process environment, not ignored dotenv extras).
    uploads = Path(os.environ.get('GSP_UPLOAD_DIR', str(BACKEND / 'uploads')))
    checks = results(values, docs_disabled=docs_disabled, uploads=uploads, legal_directory=BACKEND / 'app/legal')
    for name, passed in checks.items():
        print(('PASS ' if passed else 'FAIL ') + name)
    return 0 if all(checks.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
