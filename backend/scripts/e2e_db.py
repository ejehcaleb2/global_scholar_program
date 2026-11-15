"""Isolated browser-test database lifecycle; never operates on development data."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from uuid import UUID

import asyncpg
from sqlalchemy import delete, select, update
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
ENV_FILE = ROOT / '.env.e2e'
BASELINE = ROOT / 'app/test-artifacts/e2e-baseline.json'
DATABASE = 'Global_scholar_e2e'


def require_e2e_database(database: str | None) -> str:
    if not database or not re.fullmatch(r'[A-Za-z0-9_]+_e2e', database):
        raise ValueError('Refusing database without the _e2e suffix')
    return database


def read_environment() -> dict[str, str]:
    if not ENV_FILE.is_file():
        return {}
    return {key: json.loads(value) for key, value in
            (line.split('=', 1) for line in ENV_FILE.read_text(encoding='utf-8-sig').splitlines()
             if line and not line.startswith('#'))}


def environment() -> dict[str, str]:
    from app.core.config import get_settings
    existing = read_environment()
    development = make_url(get_settings().DATABASE_URL)
    target = development.set(database=DATABASE)
    values = {
        'DATABASE_URL': target.render_as_string(hide_password=False),
        'APP_ENV': 'test',
        'JWT_SECRET': existing.get('JWT_SECRET') or secrets.token_urlsafe(48),
        'GSP_E2E_PASSWORD': existing.get('GSP_E2E_PASSWORD') or secrets.token_urlsafe(24),
        'GSP_E2E_API_URL': 'http://127.0.0.1:8101',
        'GSP_E2E_API_PORT': '8101',
        'GSP_E2E_FRONTEND_PORT': '3101',
        'GSP_E2E_BASE_URL': 'http://127.0.0.1:3101',
        'GSP_E2E_UPLOAD_DIR': str(Path(tempfile.gettempdir()) / 'gsp-stabilize-e2e-uploads'),
    }
    require_e2e_database(target.database)
    ENV_FILE.write_text(''.join(f'{key}={json.dumps(value)}\n' for key, value in values.items()), encoding='utf-8')
    return values


async def provision(values: dict[str, str], reset: bool) -> None:
    url = make_url(values['DATABASE_URL'])
    database = require_e2e_database(url.database)
    connection = await asyncpg.connect(host=url.host, port=url.port or 5432,
                                      user=url.username, password=url.password, database='postgres')
    try:
        exists = await connection.fetchval('SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)', database)
        if reset and exists:
            await connection.execute(f'DROP DATABASE "{database}" WITH (FORCE)')
            exists = False
        if not exists:
            await connection.execute(f'CREATE DATABASE "{database}"')
    finally:
        await connection.close()


def configure(values: dict[str, str]) -> None:
    require_e2e_database(make_url(values['DATABASE_URL']).database)
    os.environ.update(values)
    os.environ['GSP_UPLOAD_DIR'] = values['GSP_E2E_UPLOAD_DIR']
    from app.core.config import get_settings
    get_settings.cache_clear()


async def seed(values: dict[str, str]) -> None:
    from app.core.security import get_password_hash
    from app.db.session import AsyncSessionLocal, engine
    from app.models.gsp_models import Profile, User, UserRole, EducationLevel, Subscription, SubscriptionPlan, SubscriptionStatus
    from scripts.seed_data import ensure_seed_consents, seed_courses, seed_resources, seed_opportunities, seed_masterclasses, seed_posts
    from app.db.base import Base
    from datetime import datetime, timedelta, timezone
    async with AsyncSessionLocal() as session:
        for email, name, role in [('admin@gsp.test', 'GSP Administrator', UserRole.admin),
                                  ('paid.student@gsp.test', 'Amina Nfor', UserRole.student),
                                  ('free.student@gsp.test', 'Brian Talla', UserRole.student),
                                  ('cfp-no-consent@gsp.test', 'CFP Consent Fixture', UserRole.student)]:
            user = await session.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(email=email, role=role, hashed_password=get_password_hash(values['GSP_E2E_PASSWORD']))
                user.profile = Profile(full_name=name, country='Cameroon', education_level=EducationLevel.high_school,
                                       school='GSP browser fixture', city='Bamenda',
                                       what_brings_you=['scholarships'], fields_of_study=['Computer Science'],
                                       countries_of_interest=['Canada'])
                session.add(user)
                await session.flush()
                if email.startswith('paid.'):
                    session.add(Subscription(user_id=user.id, plan=SubscriptionPlan.monthly,
                                             status=SubscriptionStatus.active,
                                             current_period_end=datetime.now(timezone.utc)+timedelta(days=30)))
            if email != 'cfp-no-consent@gsp.test':
                await ensure_seed_consents(session, user)
        admin = await session.scalar(select(User).where(User.email == 'admin@gsp.test'))
        await seed_courses(session)
        await seed_resources(session)
        await seed_opportunities(session, admin.id)
        await seed_masterclasses(session)
        await seed_posts(session)
        await session.commit()
        baseline = {}
        for table in Base.metadata.sorted_tables:
            keys = list(table.primary_key.columns)
            if len(keys) == 1:
                baseline[table.name] = {'key': keys[0].name,
                                        'ids': [str(value) for value in (await session.execute(select(keys[0]))).scalars()]}
        baseline['profiles']['avatar_urls'] = {str(row.user_id): row.avatar_url for row in (await session.scalars(select(Profile))).all()}
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(baseline, indent=2), encoding='utf-8')
    await engine.dispose()
    print('E2E fixtures ready: database=Global_scholar_e2e; accounts=4; credentials written to ignored .env.e2e')


async def teardown(values: dict[str, str]) -> None:
    import shutil
    from sqlalchemy import cast, String, func
    from app.db.session import AsyncSessionLocal, engine
    from app.db.base import Base
    import app.models.gsp_models  # noqa: F401 - register tables
    require_e2e_database(make_url(values['DATABASE_URL']).database)
    baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
    async with AsyncSessionLocal() as session:
        for table in reversed(Base.metadata.sorted_tables):
            saved = baseline[table.name]
            key = table.c[saved['key']]
            result = await session.execute(delete(table).where(cast(key, String).not_in(saved['ids'])))
            if result.rowcount:
                print(f'E2E cleanup {table.name}: removed={result.rowcount}')
        from app.models.gsp_models import Profile
        restored = 0
        for user_id, key in baseline['profiles'].get('avatar_urls', {}).items():
            result = await session.execute(update(Profile).where(Profile.user_id == UUID(user_id), Profile.avatar_url.is_distinct_from(key)).values(avatar_url=key))
            restored += result.rowcount
        if restored:
            print(f'E2E seed avatars restored: {restored}')
        await session.commit()
        for table in Base.metadata.sorted_tables:
            saved = baseline[table.name]
            extra = await session.scalar(select(func.count()).select_from(table).where(
                cast(table.c[saved['key']], String).not_in(saved['ids'])))
            if extra:
                raise RuntimeError('Unexpected rows remain after E2E cleanup: '+table.name)
    await engine.dispose()
    upload = Path(values['GSP_E2E_UPLOAD_DIR']).resolve()
    expected = Path(tempfile.gettempdir()).resolve()/'gsp-stabilize-e2e-uploads'
    if upload != expected:
        raise ValueError('Refusing unexpected E2E upload path')
    if upload.exists():
        shutil.rmtree(upload)
    print('E2E teardown: extra/test rows=0; temporary uploads removed; development database untouched')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reset', action='store_true')
    parser.add_argument('--teardown', action='store_true')
    args = parser.parse_args()
    values = read_environment() if args.teardown else environment()
    require_e2e_database(make_url(values['DATABASE_URL']).database)
    if not args.teardown:
        asyncio.run(provision(values, args.reset))
        result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'],
                                cwd=ROOT/'backend', env={**os.environ, **values}, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('E2E migration failed (credential-bearing diagnostics withheld)')
    configure(values)
    asyncio.run(teardown(values) if args.teardown else seed(values))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('E2E lifecycle failed safely: '+type(exc).__name__, file=sys.stderr)
        raise SystemExit(1)
