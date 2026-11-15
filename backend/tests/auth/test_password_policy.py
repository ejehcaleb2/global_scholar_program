import json
import unittest
from pathlib import Path

from app.core.common_passwords import COMMON_PASSWORDS
from app.core.password_policy import password_error


class PasswordPolicyTests(unittest.TestCase):
    def test_byte_boundaries_and_no_composition_requirements(self):
        for size, expected in [(9, 'password_bytes'), (10, None), (72, None), (73, 'password_bytes')]:
            self.assertEqual(password_error('x' * size, 'owner@example.com', None), expected)
        self.assertIsNone(password_error('é' * 36, 'owner@example.com', None))
        self.assertEqual(password_error('é' * 37, 'owner@example.com', None), 'password_bytes')

    def test_identity_is_case_insensitive_and_checks_name_parts(self):
        self.assertEqual(password_error('prefixSCHOLARsuffix', 'scholar@example.com', None), 'password_identity')
        self.assertEqual(password_error('prefixStudentsuffix', 'owner@example.com', 'CFP Student'), 'password_identity')
        self.assertIsNone(password_error('x' * 12, 'owner@example.com', 'CFP Student'))

    def test_exactly_200_public_entries_are_identical_in_frontend(self):
        self.assertEqual(len(COMMON_PASSWORDS), 200)
        client = json.loads((Path(__file__).resolve().parents[3] / 'app/lib/utils/common-passwords.json').read_text())
        self.assertEqual(set(client), COMMON_PASSWORDS)
        for value in COMMON_PASSWORDS:
            if 10 <= len(value.encode()) <= 72:
                self.assertEqual(password_error(value.upper(), 'owner@example.com', None), 'password_common')
