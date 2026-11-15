from tests import configure_test_environment, credential

configure_test_environment()

import uuid
import asyncio
import unittest
from unittest import TestCase

import httpx
from sqlalchemy import delete

from app.dependencies.auth import require_admin, require_authenticated
from app.main import app
from app.core.security import create_access_token, decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.gsp_models import User, UserRole


class FakeSession:
    def __init__(self, user: User) -> None:
        self.user = user

    async def scalar(self, _statement: object) -> User:
        return self.user


class AuthTests(TestCase):
    def test_auth_and_validation_logs_do_not_expose_credentials(self) -> None:
        import logging
        self.email = 'cfp-http-' + self.email
        with self.assertLogs(level=logging.INFO) as captured:
            self.test_valid_login_succeeds()
            response = self.loop.run_until_complete(self.client.post('/auth/login', json={'email': self.email, 'password': self.password}))
            token = response.json()['tokens']['access_token']
            failed = self.loop.run_until_complete(self.client.post('/auth/login', json={'email': self.email, 'password': credential() + 'wrong'}))
            invalid = self.loop.run_until_complete(self.client.post('/auth/login', json={'email': 'invalid', 'password': self.password}))
        self.assertEqual(failed.status_code, 401)
        self.assertEqual(invalid.status_code, 422)
        output = '\n'.join(captured.output)
        self.assertFalse(self.password in output)
        self.assertFalse(token in output)
        self.assertFalse(self.email in output)
        print('AUTH_LOG_CAPTURE success=200 failure=401 validation=422 credential_occurrences=0')

    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self) -> None:
        self.email = f'test-{uuid.uuid4()}@example.com'
        self.password = credential()
        self.client = self.loop.run_until_complete(
            self._create_client()
        )

    async def _create_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')

    def tearDown(self) -> None:
        self.loop.run_until_complete(self.client.aclose())
        self.loop.run_until_complete(self._cleanup_user())

    async def _cleanup_user(self) -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(delete(User).where(User.email == self.email))
            await session.commit()
            if self.email.startswith('cfp-http-'):
                print('CFP_HTTP_TEST_USERS_REMOVED', result.rowcount)

    def test_valid_login_succeeds(self) -> None:
        signup_response = self.loop.run_until_complete(self.client.post(
            '/auth/signup',
            json={
                'email': self.email,
                'password': self.password,
                'full_name': 'Stage Three Test User',
                'country': 'Cameroon',
                'date_of_birth': '2008-01-01',
                'accept_terms': True, 'accept_privacy': True,
            },
        ))
        self.assertEqual(signup_response.status_code, 201)
        self.assertNotIn('password', signup_response.text.lower())

        duplicate_signup = self.loop.run_until_complete(self.client.post(
            '/auth/signup',
            json={
                'email': self.email,
                'password': self.password,
                'full_name': 'Stage Three Test User',
                'country': 'Cameroon',
                'date_of_birth': '2008-01-01',
                'accept_terms': True, 'accept_privacy': True,
            },
        ))
        self.assertEqual(duplicate_signup.status_code, 409)
        self.assertEqual(duplicate_signup.json()['detail'], 'An account with this email already exists')

        login_response = self.loop.run_until_complete(self.client.post(
            '/auth/login',
            json={'email': self.email, 'password': self.password},
        ))

        self.assertEqual(login_response.status_code, 200)
        body = login_response.json()
        self.assertTrue(body['tokens']['access_token'])
        self.assertTrue(body['tokens']['refresh_token'])
        self.assertEqual(body['user']['email'], self.email)
        self.assertEqual(body['user']['role'], 'student')
        self.assertNotIn('password', login_response.text.lower())

    def test_student_token_is_rejected_by_require_admin(self) -> None:
        user = User(
            id=uuid.uuid4(),
            email=self.email,
            hashed_password='unused-in-role-test',
            role=UserRole.student,
            is_active=True,
        )
        token_payload = decode_access_token(create_access_token(str(user.id)))
        authenticated_user = self.loop.run_until_complete(
            require_authenticated(token_payload, FakeSession(user))
        )

        with self.assertRaisesRegex(Exception, 'Admin access required'):
            self.loop.run_until_complete(require_admin(authenticated_user))


if __name__ == '__main__':
    unittest.main()
