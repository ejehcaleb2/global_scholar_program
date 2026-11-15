import asyncio
import base64
import json
import secrets
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from types import SimpleNamespace

from tests import configure_test_environment, credential

configure_test_environment()

import httpx
import jwt

from app.core.security import create_access_token, create_refresh_token, decode_access_token, get_password_hash, settings, token_is_current
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import Profile, User, UserRole
from sqlalchemy import delete, select


class TokenSecurityTests(unittest.TestCase):
    def test_issued_time_never_rounds_into_the_future(self) -> None:
        from unittest.mock import patch
        actual = datetime(2026, 11, 1, 12, 0, 0, 999999, tzinfo=timezone.utc)
        with patch('app.core.security.datetime') as clock:
            clock.now.return_value = actual
            token = create_access_token(str(uuid4()))
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM], options={'verify_exp': False, 'verify_iat': False})
        self.assertLessEqual(payload['iat'], actual.timestamp())
        self.assertEqual(payload['iat'], int(actual.timestamp() * 1000) / 1000)

    def claims(self) -> dict:
        now = round(datetime.now(timezone.utc).timestamp(), 3)
        return {'sub': str(uuid4()), 'type': 'access', 'iat': now, 'jti': str(uuid4()), 'exp': now + 300}

    def signed(self, claims: dict) -> str:
        return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    def rejected(self, token: str) -> None:
        with self.assertRaisesRegex(ValueError, '^Invalid token$'):
            decode_access_token(token)

    def test_fresh_access_and_refresh_require_claims_and_millisecond_iat(self) -> None:
        subject = str(uuid4())
        access = decode_access_token(create_access_token(subject))
        refresh = decode_access_token(create_refresh_token(subject), expected_type='refresh')
        self.assertEqual(access['sub'], subject)
        self.assertEqual(refresh['sub'], subject)
        self.assertEqual(access['type'], 'access')
        self.assertEqual(refresh['type'], 'refresh')
        self.assertIsInstance(access['iat'], float)
        self.assertEqual(access['iat'], round(access['iat'], 3))
        self.assertTrue(access['jti'] != refresh['jti'])

    def test_unsigned_and_unconfigured_algorithms_are_rejected(self) -> None:
        self.rejected(jwt.encode(self.claims(), key=None, algorithm='none'))
        self.rejected(jwt.encode(self.claims(), settings.JWT_SECRET, algorithm='HS384'))

    def test_another_secret_is_rejected(self) -> None:
        self.rejected(jwt.encode(self.claims(), secrets.token_urlsafe(48), algorithm=settings.JWT_ALGORITHM))

    def test_expired_token_is_rejected(self) -> None:
        self.rejected(create_access_token(str(uuid4()), timedelta(seconds=-1)))

    def test_each_required_claim_is_rejected_when_missing(self) -> None:
        for name in ['exp', 'iat', 'sub', 'jti', 'type']:
            with self.subTest(claim=name):
                claims = self.claims()
                claims.pop(name)
                self.rejected(self.signed(claims))

    def test_tampered_payload_is_rejected(self) -> None:
        header, payload, signature = self.signed(self.claims()).split('.')
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        claims['sub'] = str(uuid4())
        changed = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b'=').decode()
        self.rejected('.'.join([header, changed, signature]))

    def test_wrong_type_is_rejected_by_decoder_and_endpoints(self) -> None:
        access = create_access_token(str(uuid4()))
        refresh = create_refresh_token(str(uuid4()))
        self.rejected(refresh)
        with self.assertRaises(ValueError):
            decode_access_token(access, expected_type='refresh')

        async def check() -> None:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                profile = await client.get('/profile', headers={'Authorization': 'Bearer ' + refresh})
                renewal = await client.post('/auth/refresh', json={'refresh_token': access})
                self.assertEqual(profile.status_code, 401)
                self.assertEqual(renewal.status_code, 401)
        asyncio.run(check())

    def test_revocation_compares_milliseconds_and_active_state(self) -> None:
        payload = decode_access_token(create_access_token(str(uuid4())))
        user = SimpleNamespace(is_active=True, token_valid_after=datetime.fromtimestamp(payload['iat'], timezone.utc))
        self.assertTrue(token_is_current(payload, user))
        user.token_valid_after += timedelta(milliseconds=1)
        self.assertFalse(token_is_current(payload, user))
        user.token_valid_after = None
        user.is_active = False
        self.assertFalse(token_is_current(payload, user))


class TokenRevocationIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self) -> None:
        self.user_id = uuid4()
        self.password = credential()

        async def create() -> None:
            async with AsyncSessionLocal() as session:
                user = User(id=self.user_id, email=f'cfp-token-{self.user_id}@example.com', hashed_password=get_password_hash(self.password), role=UserRole.student, is_active=True)
                user.profile = Profile(full_name='CFP Security Student', country='Cameroon')
                session.add(user)
                await session.commit()
        self.loop.run_until_complete(create())

    def tearDown(self) -> None:
        async def remove() -> None:
            async with AsyncSessionLocal() as session:
                await session.execute(delete(User).where(User.id == self.user_id))
                await session.commit()
        self.loop.run_until_complete(remove())

    def test_password_change_rejects_old_pair_and_returns_working_pair(self) -> None:
        # This is a token test: its replacement must satisfy this fixture's policy.
        # Hex cannot contain the fixture name words CFP, Security or Student.
        new_password = secrets.token_hex(24)
        async def check() -> None:
            access = create_access_token(str(self.user_id))
            refresh = create_refresh_token(str(self.user_id))
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                changed = await client.post('/profile/password', headers={'Authorization': 'Bearer ' + access}, json={'current_password': self.password, 'new_password': new_password})
                self.assertEqual(changed.status_code, 200, changed.json().get('detail') if changed.status_code != 200 else None)
                pair = changed.json()['tokens']
                self.assertTrue(bool(pair['access_token']) and bool(pair['refresh_token']))
                old_access = await client.get('/profile', headers={'Authorization': 'Bearer ' + access})
                old_refresh = await client.post('/auth/refresh', json={'refresh_token': refresh})
                fresh_access = await client.get('/profile', headers={'Authorization': 'Bearer ' + pair['access_token']})
                fresh_refresh = await client.post('/auth/refresh', json={'refresh_token': pair['refresh_token']})
                self.assertEqual(old_access.status_code, 401)
                self.assertEqual(old_refresh.status_code, 401)
                self.assertEqual(fresh_access.status_code, 200)
                self.assertEqual(fresh_refresh.status_code, 200)
                async with AsyncSessionLocal() as session:
                    user = await session.scalar(select(User).where(User.id == self.user_id))
                    self.assertIsNotNone(user.token_valid_after)
        self.loop.run_until_complete(check())

    def test_database_deactivation_is_checked_on_each_request(self) -> None:
        async def check() -> None:
            access = create_access_token(str(self.user_id))
            refresh = create_refresh_token(str(self.user_id))
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                first = await client.get('/profile', headers={'Authorization': 'Bearer ' + access})
                self.assertEqual(first.status_code, 200)
                async with AsyncSessionLocal() as session:
                    user = await session.get(User, self.user_id)
                    user.is_active = False
                    await session.commit()
                second = await client.get('/profile', headers={'Authorization': 'Bearer ' + access})
                renewal = await client.post('/auth/refresh', json={'refresh_token': refresh})
                self.assertEqual(second.status_code, 401)
                self.assertEqual(renewal.status_code, 401)
        self.loop.run_until_complete(check())
