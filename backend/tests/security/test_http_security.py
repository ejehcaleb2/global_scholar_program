import asyncio
import io
import logging
import runpy
import unittest
from unittest.mock import patch

from tests import configure_test_environment, credential
configure_test_environment()

import httpx
from fastapi import FastAPI
from fastapi.responses import Response
from app.core.config import get_settings
from app.core.http_security import SecurityMiddleware, configure_logging, redact
from app.main import app


class HttpSecurityTests(unittest.TestCase):
    def test_headers_request_ids_validation_and_generic_error(self):
        fixture = FastAPI()
        fixture.add_middleware(SecurityMiddleware)

        @fixture.get('/json')
        def json_route():
            return {'ok': True}

        @fixture.get('/media')
        def media_route():
            return Response(b'image', media_type='image/webp', headers={'Cache-Control': 'public, max-age=60'})

        @fixture.get('/failure')
        def failure():
            raise RuntimeError('test-only failure')

        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fixture, raise_app_exceptions=False), base_url='http://test') as client:
                for supplied in ['valid-id-123', 'bad', 'x' * 65, '<invalid-request>']:
                    response = await client.get('/json', headers={'Authorization': 'Bearer invalid', 'X-Request-ID': supplied})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                    self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
                    self.assertEqual(response.headers['Referrer-Policy'], 'no-referrer')
                    self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
                    self.assertEqual(response.headers['X-Request-ID'], supplied) if supplied == 'valid-id-123' else self.assertRegex(response.headers['X-Request-ID'], r'^[0-9a-f-]{36}$')
                media = await client.get('/media')
                self.assertEqual(media.headers['Cache-Control'], 'public, max-age=60')
                response = await client.get('/failure', headers={'X-Request-ID': 'failure-id-123'})
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json(), {'detail': 'Internal server error', 'request_id': 'failure-id-123'})
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                response = await client.post('/auth/login', json={'email': 'invalid', 'password': credential()})
                self.assertEqual(response.status_code, 422)
                for error in response.json()['detail']:
                    self.assertEqual(set(error), {'loc', 'msg', 'type'})
                print('HTTP_422_KEYS', sorted(response.json()['detail'][0]))
        asyncio.run(run())

    def test_production_disables_docs_and_development_enables_them(self):
        for environment in ['production', 'development']:
            with patch('app.core.config.get_settings', return_value=get_settings().model_copy(update={'APP_ENV': environment})):
                fixture = runpy.run_path('app/main.py')['app']
            async def run():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fixture), base_url='http://test') as client:
                    for path in ['/docs', '/redoc', '/openapi.json']:
                        self.assertEqual((await client.get(path)).status_code, 404 if environment == 'production' else 200)
            asyncio.run(run())

    def test_log_redaction_formatted_values_json_tokens_and_tracebacks(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger('cfp.security-test')
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        configure_logging()
        secret = credential()
        email = 'cfp-log-owner@example.com'
        token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'
        try:
            logger.info('password=%s email=%s Authorization: Bearer %s', secret, email, token)
            logger.info('{"password":"%s", "refresh_token":"%s"}', secret, token)
            logger.info('{"password":"%s with spaces"}', secret)
            try:
                raise ValueError(f'password={secret} email={email}')
            except ValueError:
                logger.exception('Exception fixture')
            output = stream.getvalue()
            self.assertFalse(secret in output)
            self.assertFalse(email in output)
            self.assertFalse(token in output)
            self.assertNotIn('with spaces', output)
            self.assertIn('c***@example.com', output)
            self.assertIn('Traceback', output)
            self.assertEqual(redact('Authorization: Bearer hidden-value'), 'Authorization: [REDACTED]')
        finally:
            logger.removeHandler(handler)
