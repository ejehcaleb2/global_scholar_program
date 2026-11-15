import asyncio
import os
import secrets
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tests import configure_test_environment

configure_test_environment()

import httpx
from fastapi import FastAPI
from pydantic import ValidationError

from app.core.config import Settings
from app.core.cors import add_cors_middleware
from scripts.generate_secret import generate_secret


class ConfigurationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.secret = secrets.token_urlsafe(48)

    def settings(self, *, missing_secret: bool = False, **overrides) -> Settings:
        values = {
            'APP_ENV': 'test',
            'DATABASE_URL': 'postgresql+asyncpg://test@localhost/test',
            'JWT_SECRET': self.secret,
        }
        values.update(overrides)
        if missing_secret:
            values.pop('JWT_SECRET')
        with patch.dict(os.environ, {}, clear=True):
            return Settings(_env_file=None, **values)

    def test_missing_secret_fails_at_load_without_value_output(self) -> None:
        with self.assertRaises(ValidationError) as raised:
            self.settings(missing_secret=True)
        self.assertIn('JWT_SECRET', str(raised.exception))
        self.assertNotIn('input_value=', str(raised.exception))

    def test_short_and_placeholder_secrets_fail_with_actionable_safe_message(self) -> None:
        cases = [secrets.token_urlsafe(8), 'change-me', 'changeme', 'secret', 'your-secret-key', 'supersecret', 'test']
        for value in cases:
            with self.assertRaises(ValidationError) as raised:
                self.settings(JWT_SECRET=value)
            message = str(raised.exception)
            self.assertIn('generate_secret.py', message)
            self.assertNotIn('input_value=', message)
            self.assertFalse(repr(value) in message)

    def test_valid_secret_is_hidden_from_settings_repr(self) -> None:
        configured = self.settings()
        self.assertFalse(self.secret in repr(configured))

    def test_app_env_defaults_to_production(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            configured = Settings(
                _env_file=None,
                DATABASE_URL='postgresql+asyncpg://test@localhost/test',
                JWT_SECRET=self.secret,
                CORS_ORIGINS='https://gsp.example',
            )
        self.assertEqual(configured.APP_ENV, 'production')

    def test_production_cors_rejects_local_and_wildcard_origins(self) -> None:
        for origins in ['http://localhost:3000', 'http://127.0.0.1:3000', '*', 'https://*.example']:
            with self.assertRaises(ValidationError) as raised:
                self.settings(APP_ENV='production', CORS_ORIGINS=origins)
            self.assertIn('CORS_ORIGINS', str(raised.exception))
            self.assertFalse(self.secret in str(raised.exception))
        configured = self.settings(APP_ENV='production', CORS_ORIGINS='https://gsp.example, https://admin.gsp.example')
        self.assertEqual(configured.cors_origins, ['https://gsp.example', 'https://admin.gsp.example'])

    def test_development_cors_defaults_are_the_two_local_origins(self) -> None:
        self.assertEqual(self.settings(APP_ENV='development').cors_origins, ['http://localhost:3000', 'http://127.0.0.1:3000'])

    def test_cors_preflight_allows_only_explicit_origin_methods_and_headers(self) -> None:
        async def check() -> None:
            api = FastAPI()
            configured = self.settings(CORS_ORIGINS='http://127.0.0.1:3101')
            with patch('app.core.cors.get_settings', return_value=configured):
                add_cors_middleware(api)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api), base_url='http://test') as client:
                headers = {'Origin': 'http://127.0.0.1:3101', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'}
                allowed = await client.options('/health', headers=headers)
                self.assertEqual(allowed.status_code, 200)
                self.assertEqual(allowed.headers['access-control-allow-origin'], headers['Origin'])
                self.assertNotIn('access-control-allow-credentials', allowed.headers)
                self.assertNotIn('*', allowed.headers['access-control-allow-methods'])
                self.assertNotIn('*', allowed.headers['access-control-allow-headers'])
                denied_origin = await client.options('/health', headers={**headers, 'Origin': 'https://untrusted.example'})
                denied_header = await client.options('/health', headers={**headers, 'Access-Control-Request-Headers': 'x-unapproved'})
                self.assertEqual(denied_origin.status_code, 400)
                self.assertEqual(denied_header.status_code, 400)
        asyncio.run(check())

    def test_generator_replaces_only_secret_line_preserving_other_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            previous = secrets.token_urlsafe(48).encode()
            content = b'# private configuration\r\nOTHER=untouched\r\nJWT_SECRET=' + previous + b'\r\nLAST=unchanged'
            path.write_bytes(content)
            generate_secret(path)
            result = path.read_bytes()
            unchanged = lambda value: [line for line in value.splitlines(keepends=True) if not line.startswith(b'JWT_SECRET=')]
            self.assertEqual(unchanged(result), unchanged(content))
            replacement = next(line.split(b'=', 1)[1].strip() for line in result.splitlines() if line.startswith(b'JWT_SECRET='))
            self.assertEqual(len(replacement), 64)
            self.assertFalse(replacement == previous)
            self.assertEqual(list(Path(directory).glob('.jwt-*')), [])

    def test_generator_appends_a_missing_secret_without_replacing_settings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            original = b'# config\r\nOTHER=untouched'
            path.write_bytes(original)
            generate_secret(path)
            self.assertTrue(path.read_bytes().startswith(original + b'\r\nJWT_SECRET='))
