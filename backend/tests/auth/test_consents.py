import asyncio
import unittest
from unittest.mock import patch
from uuid import uuid4

from tests import configure_test_environment, credential
configure_test_environment()

import httpx
from sqlalchemy import delete, event, func, select
from app.core.security import create_access_token, get_password_hash
from app.db.session import AsyncSessionLocal
from app.core.legal import LEGAL_VERSIONS
from app.main import app
from app.models.gsp_models import Consent, ConsentType, Profile, User, UserRole


class ConsentIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls):
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self):
        self.prefix = f'cfp-consent-{uuid4()}'
        self.id = uuid4()
        async def create():
            async with AsyncSessionLocal() as db:
                user = User(id=self.id, email=self.prefix + '@example.com', hashed_password=get_password_hash(credential()))
                user.profile = Profile(full_name='CFP Consent Student')
                db.add(user)
                await db.commit()
        self.loop.run_until_complete(create())

    def tearDown(self):
        async def remove():
            async with AsyncSessionLocal() as db:
                result = await db.execute(delete(User).where(User.email.startswith(self.prefix)))
                await db.commit()
                print('CFP_CONSENT_TEST_USERS_REMOVED', result.rowcount)
        self.loop.run_until_complete(remove())

    def run_client(self, callback):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as client:
                await callback(client)
        self.loop.run_until_complete(run())

    def signup(self, **changes):
        return {'email': self.prefix + '-signup@example.com', 'password': credential(), 'full_name': 'CFP Consent Student', 'country': 'Cameroon', 'date_of_birth': '2008-01-01', 'accept_terms': True, 'accept_privacy': True, **changes}

    def test_signup_records_both_versions_in_transaction(self):
        async def run(client):
            response = await client.post('/auth/signup', json=self.signup())
            self.assertEqual(response.status_code, 201)
            async with AsyncSessionLocal() as db:
                user = await db.scalar(select(User).where(User.email == self.signup()['email']))
                self.assertIsNotNone(await db.get(Profile, user.id))
                rows = (await db.execute(select(Consent.consent_type, Consent.version).where(Consent.user_id == user.id))).all()
                self.assertEqual(dict(rows), {ConsentType(key): value for key, value in LEGAL_VERSIONS.items()})
        self.run_client(run)

    def test_consent_insert_failure_rolls_back_user_and_profile(self):
        async def run(client):
            with patch('app.routers.auth.LEGAL_VERSIONS', {'tos': None, 'privacy': LEGAL_VERSIONS['privacy']}):
                response = await client.post('/auth/signup', json=self.signup())
            self.assertEqual(response.status_code, 500)
            async with AsyncSessionLocal() as db:
                self.assertIsNone(await db.scalar(select(User).where(User.email == self.signup()['email'])))
        self.run_client(run)

    def test_missing_false_and_non_boolean_consent_are_rejected(self):
        async def run(client):
            for index, flags in enumerate([{}, {'accept_terms': False, 'accept_privacy': True}, {'accept_terms': True, 'accept_privacy': False}, {'accept_terms': 'true', 'accept_privacy': True}]):
                payload = self.signup(email=f'{self.prefix}-{index}@example.com')
                payload.pop('accept_terms')
                payload.pop('accept_privacy')
                payload.update(flags)
                response = await client.post('/auth/signup', json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertTrue(any(item['type'] == 'consent_required' for item in response.json()['detail']))
            async with AsyncSessionLocal() as db:
                self.assertEqual(await db.scalar(select(func.count()).select_from(User).where(User.email.startswith(self.prefix))), 1)
        self.run_client(run)

    def test_status_outdated_version_mismatch_acceptance_and_repeat(self):
        async def run(client):
            headers = {'Authorization': 'Bearer ' + create_access_token(str(self.id))}
            async with AsyncSessionLocal() as db:
                db.add(Consent(user_id=self.id, consent_type=ConsentType.tos, version='old'))
                await db.commit()
            initial = await client.get('/consents/status', headers=headers)
            self.assertEqual(initial.status_code, 200)
            self.assertFalse(initial.json()['complete'])
            mismatch = await client.post('/consents', headers=headers, json={'versions': {'tos': 'old', 'privacy': LEGAL_VERSIONS['privacy']}})
            self.assertEqual(mismatch.status_code, 409)
            self.assertEqual(mismatch.json()['detail']['code'], 'version_mismatch')
            for _ in range(2):
                accepted = await client.post('/consents', headers=headers, json={'versions': LEGAL_VERSIONS})
                self.assertEqual(accepted.status_code, 200)
                self.assertTrue(accepted.json()['complete'])
            async with AsyncSessionLocal() as db:
                self.assertEqual(await db.scalar(select(func.count()).select_from(Consent).where(Consent.user_id == self.id)), 3)
        self.run_client(run)

    def test_guests_denied_admins_included_and_direct_api_remains_available(self):
        async def run(client):
            self.assertEqual((await client.get('/consents/status')).status_code, 401)
            self.assertEqual((await client.post('/consents', json={'versions': LEGAL_VERSIONS})).status_code, 401)
            async with AsyncSessionLocal() as db:
                user = await db.get(User, self.id)
                user.role = UserRole.admin
                await db.commit()
            headers = {'Authorization': 'Bearer ' + create_access_token(str(self.id))}
            self.assertFalse((await client.get('/consents/status', headers=headers)).json()['complete'])
            self.assertEqual((await client.get('/profile', headers=headers)).status_code, 200)
        self.run_client(run)

    def test_nested_status_and_public_legal_query_counts(self):
        async def run(client):
            queries = []
            def count(_connection, _cursor, statement, _parameters, _context, _many):
                if statement.lstrip().upper().startswith('SELECT'):
                    queries.append(statement)
            engine = AsyncSessionLocal.kw['bind'].sync_engine
            event.listen(engine, 'before_cursor_execute', count)
            try:
                response = await client.get('/consents/status', headers={'Authorization': 'Bearer ' + create_access_token(str(self.id))})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(queries), 2)
                print('CONSENT_STATUS_SQL_QUERY_COUNT', len(queries))
                queries.clear()
                self.assertEqual((await client.get('/legal/current')).status_code, 200)
                self.assertEqual((await client.get('/legal/terms')).status_code, 200)
                self.assertEqual(len(queries), 0)
                print('PUBLIC_LEGAL_SQL_QUERY_COUNT', len(queries))
            finally:
                event.remove(engine, 'before_cursor_execute', count)
        self.run_client(run)
