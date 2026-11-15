import calendar
import json
import unittest
from datetime import date, timedelta
from pathlib import Path

from tests import configure_test_environment, credential
configure_test_environment()

from pydantic import ValidationError
from app.schemas.auth import COUNTRIES, SignupRequest


class SignupValidationTests(unittest.TestCase):
    def test_multibyte_password_uses_byte_policy_without_character_minimum(self):
        from app.core.password_policy import password_error
        from app.schemas.profile import PasswordChangeRequest
        value = '\u00e9' * 5
        signup = SignupRequest(**self.payload(password=value))
        change = PasswordChangeRequest(current_password=credential(), new_password=value)
        self.assertIsNone(password_error(signup.password, signup.email, signup.full_name))
        self.assertIsNone(password_error(change.new_password, signup.email, signup.full_name))

    def payload(self, **changes):
        return {'email': 'cfp-validation@example.com', 'password': credential(), 'full_name': ' CFP Student ', 'date_of_birth': '2008-01-01', 'country': 'Cameroon', 'accept_terms': True, 'accept_privacy': True, **changes}

    def test_name_phone_and_email_are_normalized(self):
        value = SignupRequest(**self.payload(full_name=' \x00CFP\n Student\t ', phone='+237 6-1234 5678', email=' CFP-VALIDATION@EXAMPLE.COM '))
        self.assertEqual(value.full_name, 'CFP Student')
        self.assertEqual(value.phone, '237612345678')
        self.assertEqual(value.email, 'cfp-validation@example.com')
        self.assertIsNone(SignupRequest(**self.payload()).phone)
        self.assertIsNone(SignupRequest(**self.payload(phone='')).phone)

    def test_required_fields_and_limits(self):
        for field in ['full_name', 'date_of_birth', 'country']:
            payload = self.payload()
            payload.pop(field)
            with self.assertRaises(ValidationError):
                SignupRequest(**payload)
        for changes in [{'full_name': ' '}, {'full_name': 'x' * 121}, {'country': 'not-a-country'}, {'phone': '123456'}, {'phone': '1' * 16}, {'phone': '1234567ext'}, {'date_of_birth': '2000-02-30'}, {'date_of_birth': str(date.today() + timedelta(days=1))}]:
            with self.assertRaises(ValidationError):
                SignupRequest(**self.payload(**changes))
        self.assertEqual(len(SignupRequest(**self.payload(full_name='x' * 120)).full_name), 120)
        self.assertEqual(SignupRequest(**self.payload(phone='1' * 15)).phone, '1' * 15)

    def test_calendar_age_boundaries(self):
        today = date.today()
        for years, accepted in [(9, False), (10, True), (100, True), (101, False)]:
            born = date(today.year - years, today.month, min(today.day, calendar.monthrange(today.year - years, today.month)[1]))
            if accepted:
                self.assertEqual(SignupRequest(**self.payload(date_of_birth=born)).date_of_birth, born)
            else:
                with self.assertRaises(ValidationError):
                    SignupRequest(**self.payload(date_of_birth=born))

    def test_backend_country_list_matches_existing_client_list(self):
        client = Path(__file__).resolve().parents[3] / 'app/node_modules/country-list/data.json'
        self.assertEqual(COUNTRIES, {row['name'] for row in json.loads(client.read_text(encoding='utf-8'))})
