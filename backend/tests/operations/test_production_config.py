import tempfile
import unittest
from pathlib import Path

from tests import credential
from scripts.check_production_config import PROJECT, results


class ProductionConfigTests(unittest.TestCase):
    def test_checks_fail_closed_without_exposing_values(self):
        with tempfile.TemporaryDirectory(prefix='cfp-config-') as directory:
            legal = Path(directory)
            for document in ['terms', 'privacy']:
                (legal / f'{document}.en.md').write_text('CFP test review fixture', encoding='utf-8')
            values = {'APP_ENV': 'production', 'JWT_SECRET': credential() + credential('GSP_TEST_PASSWORD_2'), 'CORS_ORIGINS': 'https://gsp.example', 'DATABASE_URL': f'postgresql://gsp_app:{credential()}@database.example/gsp', 'TRUSTED_PROXY_COUNT': '0'}
            def check(**changes):
                return results({**values, **changes}, docs_disabled=True, uploads=legal, legal_directory=legal)
            self.assertTrue(all(check().values()))
            for origin in ['http://localhost:3000', 'http://127.0.0.2', 'http://[::1]', 'http://[', '*', '']:
                self.assertFalse(check(CORS_ORIGINS=origin)['CORS_ORIGINS'])
            self.assertFalse(check(JWT_SECRET='')['JWT_SECRET'])
            self.assertFalse(check(TRUSTED_PROXY_COUNT='-1')['TRUSTED_PROXY_COUNT_EXPLICIT'])
            self.assertFalse(check(DATABASE_URL=f'postgresql://postgres:{credential()}@localhost/gsp')['DATABASE_USER'])
            self.assertFalse(check(DATABASE_URL=f'postgresql://gsp_app:{credential()}@127.0.0.2/gsp')['DATABASE_HOST'])
            self.assertFalse(results(values, docs_disabled=False, uploads=PROJECT / 'uploads', legal_directory=legal)['UPLOADS_OUTSIDE_PROJECT'])
            (legal / 'terms.en.md').write_text('PENDING_LEGAL_REVIEW', encoding='utf-8')
            self.assertFalse(check()['LEGAL_REVIEW'])
            (legal / 'terms.en.md').unlink()
            self.assertFalse(check()['LEGAL_REVIEW'])
