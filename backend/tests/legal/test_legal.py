import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from tests import configure_test_environment
configure_test_environment()

import httpx
from app.core.legal import DIRECTORY, LEGAL_VERSIONS, document, ensure_legal_ready
from app.main import app


class LegalTests(unittest.TestCase):
    def test_actual_application_lifespan_refuses_pending_legal_in_production(self):
        async def run():
            with patch('app.main.get_settings', return_value=SimpleNamespace(APP_ENV='production')):
                with self.assertRaisesRegex(RuntimeError, 'Legal documents require review'):
                    async with app.router.lifespan_context(app):
                        self.fail('Production startup must not finish with pending legal text')
        asyncio.run(run())

    def test_both_skeletons_are_pending_and_production_refuses_them(self):
        for kind in ['terms', 'privacy']:
            self.assertIn('PENDING_LEGAL_REVIEW', (DIRECTORY / f'{kind}.en.md').read_text(encoding='utf-8'))
        ensure_legal_ready('development')
        ensure_legal_ready('test')
        with self.assertRaisesRegex(RuntimeError, 'Legal documents require review'):
            ensure_legal_ready('production')

    def test_markdown_rendering_is_sanitized(self):
        with patch('pathlib.Path.read_text', return_value='# Heading\n\n<script>alert(1)</script>\n\n[link](javascript:alert(1))'):
            html = document('tos').html
        self.assertIn('<h1>Heading</h1>', html)
        self.assertNotIn('<script>', html)
        self.assertNotIn('href="javascript:', html)

    def test_public_endpoints_use_single_document_set(self):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                current = await client.get('/legal/current')
                self.assertEqual(current.status_code, 200)
                self.assertEqual({doc['type']: doc['version'] for doc in current.json()['documents']}, LEGAL_VERSIONS)
                for kind in ['terms', 'privacy']:
                    response = await client.get(f'/legal/{kind}')
                    self.assertEqual(response.status_code, 200)
                    self.assertTrue(response.json()['review_pending'])
                    self.assertIn('<h2>', response.json()['html'])
                    self.assertNotIn('?', response.json()['html'])
                self.assertEqual((await client.get('/legal/unknown')).status_code, 404)
        asyncio.run(run())
