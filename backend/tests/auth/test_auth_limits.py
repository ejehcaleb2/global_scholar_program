import asyncio
import statistics
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from tests import configure_test_environment, credential
configure_test_environment()

import httpx
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from app.core import rate_limit
from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import Profile, User


class AuthLimitIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls):
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self):
        self.id = uuid4()
        self.email = f'cfp-limits-{self.id}@example.com'
        self.password = credential()
        self.store_patch = patch.object(rate_limit, 'store', rate_limit.SlidingWindowStore())
        self.store_patch.start()
        self.addCleanup(self.store_patch.stop)
        async def create():
            async with AsyncSessionLocal() as db:
                user = User(id=self.id, email=self.email, hashed_password=get_password_hash(self.password))
                user.profile = Profile(full_name='CFP Limit Student')
                db.add(user)
                await db.commit()
        self.loop.run_until_complete(create())

    def tearDown(self):
        async def remove():
            async with AsyncSessionLocal() as db:
                await db.execute(delete(User).where(User.id == self.id))
                await db.commit()
        self.loop.run_until_complete(remove())

    def run_client(self, callback):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                await callback(client)
        self.loop.run_until_complete(run())

    def test_login_unknown_and_existing_receive_identical_limit(self):
        async def run(client):
            for email in [self.email, f'cfp-unknown-{uuid4()}@example.com']:
                statuses = []
                for _ in range(6):
                    response = await client.post('/auth/login', json={'email': email.upper(), 'password': credential('GSP_TEST_INVALID_PASSWORD')})
                    statuses.append(response.status_code)
                self.assertEqual(statuses, [401] * 5 + [429])
                self.assertEqual(response.json()['detail']['code'], 'rate_limited')
                self.assertGreater(int(response.headers['Retry-After']), 0)
        self.run_client(run)

    def test_login_success_resets_pair_but_not_email(self):
        async def run(client):
            await client.post('/auth/login', json={'email': self.email, 'password': credential('GSP_TEST_INVALID_PASSWORD')})
            success = await client.post('/auth/login', json={'email': '  ' + self.email.upper() + '  ', 'password': self.password})
            self.assertEqual(success.status_code, 200)
            self.assertNotIn(('login_pair', '127.0.0.1:' + self.email), rate_limit.store.windows)
            self.assertEqual(len(rate_limit.store.windows[('login_email', self.email)][0]), 1)
        self.run_client(run)

    def test_signup_normalized_email_window(self):
        async def run(client):
            # Existing-account conflicts count as signup attempts without creating data.
            statuses = []
            for _ in range(6):
                response = await client.post('/auth/signup', json={'email': self.email.upper(), 'password': self.password, 'full_name': 'CFP Limit Student', 'date_of_birth': '2008-01-01', 'country': 'Cameroon', 'accept_terms': True, 'accept_privacy': True})
                statuses.append(response.status_code)
            self.assertEqual(statuses, [409] * 5 + [429])
        self.run_client(run)

    def test_refresh_ip_window(self):
        settings = get_settings().model_copy(update={'RATE_REFRESH_IP': 2})
        async def run(client):
            with patch.object(rate_limit, 'get_settings', return_value=settings):
                statuses = [(await client.post('/auth/refresh', json={'refresh_token': 'invalid'})).status_code for _ in range(3)]
            self.assertEqual(statuses, [401, 401, 429])
        self.run_client(run)

    def test_profile_password_and_email_failures_are_separate(self):
        async def run(client):
            headers = {'Authorization': 'Bearer ' + create_access_token(str(self.id))}
            for path, extra in [('/profile/password', {'new_password': credential('GSP_TEST_NEW_PASSWORD')}), ('/profile/email', {'new_email': f'cfp-new-{uuid4()}@example.com'})]:
                statuses = []
                for _ in range(6):
                    response = await client.post(path, headers=headers, json={'current_password': credential('GSP_TEST_INVALID_PASSWORD'), **extra})
                    statuses.append(response.status_code)
                self.assertEqual(statuses, [401] * 5 + [429])
            self.assertEqual((await client.get('/profile', headers=headers)).status_code, 200)
        self.run_client(run)

    def test_login_ip_flood_guard_ignores_spoofed_header(self):
        settings = get_settings().model_copy(update={'RATE_LOGIN_IP': 2, 'TRUSTED_PROXY_COUNT': 0})
        async def run(client):
            with patch.object(rate_limit, 'get_settings', return_value=settings):
                statuses = [(await client.post('/auth/login', headers={'X-Forwarded-For': f'192.0.2.{i}'}, json={'email': self.email, 'password': self.password})).status_code for i in range(3)]
            self.assertEqual(statuses, [200, 200, 429])
        self.run_client(run)

    def test_unknown_and_wrong_password_timing_and_message(self):
        async def run(client):
            durations = []
            for email in [self.email, f'cfp-unknown-{uuid4()}@example.com']:
                samples = []
                for _ in range(3):
                    started = time.perf_counter()
                    response = await client.post('/auth/login', json={'email': email, 'password': credential('GSP_TEST_INVALID_PASSWORD')})
                    samples.append(time.perf_counter() - started)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.json(), {'detail': 'Invalid email or password'})
                durations.append(statistics.median(samples))
            self.assertLess(abs(durations[0] - durations[1]), max(.25, max(durations) * .75))
            print('LOGIN_TIMING_MEDIAN_SECONDS known=%.3f unknown=%.3f' % tuple(durations))
        self.run_client(run)

    def test_lower_email_index_denies_case_only_duplicate(self):
        async def run():
            async with AsyncSessionLocal() as db:
                db.add(User(email=self.email.upper(), hashed_password=get_password_hash(self.password)))
                with self.assertRaises(IntegrityError):
                    await db.flush()
                await db.rollback()
        self.loop.run_until_complete(run())
