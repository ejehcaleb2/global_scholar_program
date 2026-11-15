import asyncio
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

from tests import configure_test_environment
configure_test_environment()

import httpx
from sqlalchemy import delete, func, select
from app.core.common_passwords import COMMON_PASSWORDS
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AuditLog, Consent, Profile, Subscription, User, UserRole
from scripts import operator_common

BACKEND = Path(__file__).resolve().parents[2]


class OperatorScriptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy.engine import make_url
        from app.core.config import get_settings
        if make_url(get_settings().DATABASE_URL).database != 'Global_scholar_e2e':
            raise RuntimeError('Operator tests require the isolated Global_scholar_e2e database')
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls):
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self):
        self.prefix = 'rrp-operator-' + str(uuid4())
        self.admin_email = self.prefix + '-admin@example.com'
        self.student_email = self.prefix + '-student@example.com'
        self.new_email = self.prefix + '-new@example.com'
        self.password = secrets.token_hex(24)
        async def create():
            async with AsyncSessionLocal() as db:
                for address, role in [(self.admin_email, UserRole.admin), (self.student_email, UserRole.student)]:
                    db.add(User(email=address, role=role, is_active=True, hashed_password=get_password_hash(self.password),
                                profile=Profile(full_name='RRP Operator' if role == UserRole.admin else 'RRP Student')))
                await db.commit()
        self.loop.run_until_complete(create())

    def tearDown(self):
        async def cleanup():
            async with AsyncSessionLocal() as db:
                identifiers = list((await db.scalars(select(User.id).where(User.email.like(self.prefix + '%')))).all())
                audits = await db.execute(delete(AuditLog).where(AuditLog.actor_id.in_(identifiers)))
                users = await db.execute(delete(User).where(User.id.in_(identifiers)))
                await db.commit()
                self.assertEqual(await db.scalar(select(func.count()).select_from(User).where(User.id.in_(identifiers))), 0)
                print('RRP_OPERATOR_CLEANUP', {'audit_logs': audits.rowcount, 'users': users.rowcount})
        self.loop.run_until_complete(cleanup())

    def invoke(self, script, arguments, expected=0, *, password=None, missing_password=False):
        environment = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
        environment.pop('ADMIN_PASSWORD', None)
        secret = password if password is not None else self.password
        if script == 'create_admin' and not missing_password:
            environment['ADMIN_PASSWORD'] = secret
        result = subprocess.run([sys.executable, str(BACKEND / 'scripts' / (script + '.py')), *arguments],
                                cwd=BACKEND, env=environment, stdin=subprocess.DEVNULL,
                                capture_output=True, text=True, encoding='utf-8', timeout=45)
        output = result.stdout + result.stderr
        self.assertFalse(secret in output, 'Operator output exposed password input')
        self.assertFalse(bool(re.search(r'\$2[aby]\$|eyJ[A-Za-z0-9_-]+\.', output)), 'Operator output exposed credential material')
        self.assertEqual(result.returncode, expected, 'Operator returned an unexpected status; input values withheld')
        if expected != 2:
            self.assertIn('Database host:', output)
            self.assertIn('Database name:', output)
        return output

    async def target(self, address):
        async with AsyncSessionLocal() as db:
            return await db.scalar(select(User).where(User.email == address))

    async def audits(self):
        async with AsyncSessionLocal() as db:
            identifiers = select(User.id).where(User.email.like(self.prefix + '%'))
            return list((await db.scalars(select(AuditLog).where(AuditLog.actor_id.in_(identifiers)).order_by(AuditLog.created_at))).all())

    def test_confirmation_required_by_all_three_scripts(self):
        calls = [
            ('create_admin', ['--email', self.new_email, '--full-name', 'RRP Operator']),
            ('grant_membership', ['--email', self.student_email, '--actor-email', self.admin_email, '--plan', 'beta']),
            ('set_user_active', ['--email', self.student_email, '--actor-email', self.admin_email, '--deactivate']),
        ]
        for script, arguments in calls:
            with self.subTest(script=script):
                self.assertIn('--yes', self.invoke(script, arguments, expected=1))
        self.assertIsNone(self.loop.run_until_complete(self.target(self.new_email)))
        self.assertTrue(self.loop.run_until_complete(self.target(self.student_email)).is_active)
        self.assertEqual(len(self.loop.run_until_complete(self.audits())), 0)

    def test_dry_runs_write_no_users_memberships_or_audits(self):
        calls = [
            ('create_admin', ['--email', self.new_email, '--full-name', 'RRP Operator']),
            ('create_admin', ['--email', self.student_email, '--full-name', 'RRP Operator', '--promote']),
            ('grant_membership', ['--email', self.student_email, '--actor-email', self.admin_email, '--plan', 'monthly']),
            ('set_user_active', ['--email', self.student_email, '--actor-email', self.admin_email, '--deactivate']),
        ]
        for script, arguments in calls:
            with self.subTest(script=script):
                self.assertIn('DRY RUN', self.invoke(script, [*arguments, '--dry-run']))
        async def verify():
            self.assertIsNone(await self.target(self.new_email))
            target = await self.target(self.student_email)
            self.assertEqual(target.role, UserRole.student)
            self.assertTrue(target.is_active)
            self.assertIsNone(target.token_valid_after)
            async with AsyncSessionLocal() as db:
                self.assertEqual(await db.scalar(select(func.count()).select_from(Subscription).where(Subscription.user_id == target.id)), 0)
        self.loop.run_until_complete(verify())
        self.assertEqual(len(self.loop.run_until_complete(self.audits())), 0)

    def test_create_normalizes_identity_creates_profile_without_consent_and_audits_as_self(self):
        self.invoke('create_admin', ['--email', ' ' + self.new_email.upper() + ' ', '--full-name', ' \tRRP Operator\n ', '--yes'])
        async def verify():
            target = await self.target(self.new_email)
            self.assertEqual(target.role, UserRole.admin)
            self.assertTrue(verify_password(self.password, target.hashed_password))
            async with AsyncSessionLocal() as db:
                self.assertEqual((await db.get(Profile, target.id)).full_name, 'RRP Operator')
                self.assertEqual(await db.scalar(select(func.count()).select_from(Consent).where(Consent.user_id == target.id)), 0)
            entries = await self.audits()
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0].actor_id, target.id)
            self.assertEqual(entries[0].entity_id, str(target.id))
            self.assertEqual(entries[0].extra_data['label'], 'RRP Operator')
            self.assertNotIn('password', str(entries[0].extra_data).lower())
        self.loop.run_until_complete(verify())
        self.invoke('create_admin', ['--email', self.new_email, '--full-name', 'RRP Operator', '--yes'], expected=1)
        self.assertEqual(len(self.loop.run_until_complete(self.audits())), 1)

    def test_promotion_is_repeatable_without_password_reset_or_duplicate_profile(self):
        original = self.loop.run_until_complete(self.target(self.student_email))
        for _ in range(2):
            self.invoke('create_admin', ['--email', self.student_email, '--full-name', 'RRP Operator', '--promote', '--yes'], missing_password=True)
        async def verify():
            target = await self.target(self.student_email)
            self.assertEqual(target.role, UserRole.admin)
            self.assertTrue(target.hashed_password == original.hashed_password, 'Promotion changed the password')
            self.assertEqual(len(await self.audits()), 2)
            self.assertTrue(all(entry.actor_id == target.id for entry in await self.audits()))
            async with AsyncSessionLocal() as db:
                self.assertEqual(await db.scalar(select(func.count()).select_from(Profile).where(Profile.user_id == target.id)), 1)
        self.loop.run_until_complete(verify())

    def test_creation_validation_and_missing_password_never_create_an_account(self):
        base = ['--email', self.new_email, '--full-name', 'RRP Operator', '--yes']
        common = next(value for value in COMMON_PASSWORDS if 10 <= len(value.encode('utf-8')) <= 72)
        for value in [self.password[:9], 'rrp' + secrets.token_hex(12), common]:
            self.invoke('create_admin', base, expected=1, password=value)
        self.invoke('create_admin', base, expected=1, missing_password=True)
        self.invoke('create_admin', ['--email', 'invalid', '--full-name', 'RRP Operator', '--yes'], expected=1)
        self.invoke('create_admin', ['--email', self.new_email, '--full-name', '\n\t', '--yes'], expected=1)
        self.invoke('create_admin', [*base, '--promote'], expected=1)
        self.assertIsNone(self.loop.run_until_complete(self.target(self.new_email)))
        self.assertEqual(len(self.loop.run_until_complete(self.audits())), 0)

    def test_hidden_password_is_requested_twice_and_mismatch_is_rejected(self):
        with patch.dict(os.environ, {}, clear=True), patch('scripts.operator_common.interactive_input', return_value=True):
            with patch('scripts.operator_common.getpass.getpass', side_effect=[self.password, self.password]) as prompt:
                self.assertTrue(operator_common.password(self.new_email, 'RRP Operator') == self.password)
                self.assertEqual(prompt.call_count, 2)
            with patch('scripts.operator_common.getpass.getpass', side_effect=[self.password, secrets.token_hex(24)]):
                with self.assertRaisesRegex(operator_common.OperatorError, 'does not match'):
                    operator_common.password(self.new_email, 'RRP Operator')

    def test_grant_default_period_then_extends_same_row_with_exact_actor_audits(self):
        before = datetime.now(timezone.utc)
        self.invoke('grant_membership', ['--email', self.student_email, '--actor-email', self.admin_email, '--plan', 'beta', '--yes'])
        after = datetime.now(timezone.utc)
        async def subscription():
            target = await self.target(self.student_email)
            async with AsyncSessionLocal() as db:
                values = list((await db.scalars(select(Subscription).where(Subscription.user_id == target.id))).all())
                self.assertEqual(len(values), 1)
                return values[0]
        first = self.loop.run_until_complete(subscription())
        self.assertGreaterEqual(first.current_period_end, before + timedelta(days=30))
        self.assertLessEqual(first.current_period_end, after + timedelta(days=30))
        self.invoke('grant_membership', ['--email', self.student_email, '--actor-email', self.admin_email, '--plan', 'monthly', '--days', '5', '--yes'])
        second = self.loop.run_until_complete(subscription())
        self.assertEqual(second.id, first.id)
        self.assertEqual(second.current_period_end, first.current_period_end + timedelta(days=5))
        self.assertEqual(second.plan.value, 'monthly')
        entries = self.loop.run_until_complete(self.audits())
        actor = self.loop.run_until_complete(self.target(self.admin_email))
        self.assertEqual(len(entries), 2)
        self.assertTrue(all(entry.actor_id == actor.id and entry.entity_type == 'subscription' for entry in entries))
        self.assertIn('current_period_end', entries[-1].extra_data['changes'])

    def test_membership_and_activation_validate_target_actor_and_arguments(self):
        self.invoke('grant_membership', ['--email', self.student_email, '--actor-email', self.admin_email, '--plan', 'beta', '--days', '0', '--yes'], expected=1)
        self.invoke('grant_membership', ['--email', self.student_email, '--actor-email', self.admin_email, '--plan', 'annual', '--yes'], expected=2)
        for script, extra in [('grant_membership', ['--plan', 'beta']), ('set_user_active', ['--deactivate'])]:
            self.invoke(script, ['--email', self.student_email, '--actor-email', self.student_email, '--yes', *extra], expected=1)
            self.invoke(script, ['--email', self.new_email, '--actor-email', self.admin_email, '--yes', *extra], expected=1)
        self.assertEqual(len(self.loop.run_until_complete(self.audits())), 0)

    def test_deactivation_is_idempotent_and_reactivation_does_not_restore_old_tokens(self):
        original = self.loop.run_until_complete(self.target(self.student_email))
        token = create_access_token(str(original.id))
        arguments = ['--email', self.student_email, '--actor-email', self.admin_email, '--yes']
        self.invoke('set_user_active', [*arguments, '--deactivate'])
        first = self.loop.run_until_complete(self.target(self.student_email))
        self.assertFalse(first.is_active)
        self.assertIsNotNone(first.token_valid_after)
        self.invoke('set_user_active', [*arguments, '--deactivate'])
        second = self.loop.run_until_complete(self.target(self.student_email))
        self.assertEqual(second.token_valid_after, first.token_valid_after)
        async def status(value):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                return (await client.get('/profile', headers={'Authorization': 'Bearer ' + value})).status_code
        self.assertEqual(self.loop.run_until_complete(status(token)), 401)
        self.invoke('set_user_active', [*arguments, '--activate'])
        self.assertEqual(self.loop.run_until_complete(status(token)), 401)
        self.assertEqual(self.loop.run_until_complete(status(create_access_token(str(original.id)))), 200)
        entries = self.loop.run_until_complete(self.audits())
        self.assertEqual(len(entries), 3)
        self.assertIsNone(entries[1].extra_data['changes'])
