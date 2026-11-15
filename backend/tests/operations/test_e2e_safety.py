from tests import configure_test_environment

configure_test_environment()

from unittest import TestCase

from scripts.e2e_db import require_e2e_database


class E2EDatabaseSafetyTests(TestCase):
    def test_development_database_is_refused(self):
        for name in ('Global_scholar', 'postgres', '', None, 'Global_scholar_e2e_backup'):
            with self.subTest(database=name), self.assertRaises(ValueError):
                require_e2e_database(name)

    def test_explicit_e2e_database_is_accepted(self):
        self.assertEqual(require_e2e_database('Global_scholar_e2e'), 'Global_scholar_e2e')
