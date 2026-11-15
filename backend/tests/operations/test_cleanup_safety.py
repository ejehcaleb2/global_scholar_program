from tests import configure_test_environment

configure_test_environment()

import asyncio
import contextlib
import io
import json
from pathlib import Path
import tempfile
from unittest import TestCase
from unittest.mock import patch
import uuid

from scripts.cleanup_test_data import classification, execute_reviewed, main


class CleanupSafetyTests(TestCase):
    def test_execute_requires_an_ids_file_before_any_query(self):
        with patch('sys.argv', ['cleanup_test_data.py', '--execute']), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as result:
                main()
            self.assertEqual(result.exception.code, 2)

    def test_unknown_and_seeded_accounts_are_protected(self):
        self.assertEqual(classification('owner@example.com')[0], 'UNKNOWN')
        self.assertEqual(classification('seed-h1-student-01@gsp.test')[0], 'SEEDED')
        self.assertEqual(classification('h1-e2e-1792845271027')[0], 'TEST FIXTURE')

    def test_ids_file_cannot_authorize_a_seeded_account(self):
        identity = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory)/'ids.json'
            manifest.write_text(json.dumps({'users': [identity]}), encoding='utf-8')
            records = [{'table': 'users', 'id': identity, 'classification': 'SEEDED'}]
            with self.assertRaises(ValueError):
                asyncio.run(execute_reviewed(None, records, manifest))
