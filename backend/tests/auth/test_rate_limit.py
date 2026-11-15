import asyncio
import unittest
from unittest.mock import patch

from tests import configure_test_environment
configure_test_environment()

from fastapi import HTTPException
from starlette.requests import Request
from app.core.rate_limit import SlidingWindowStore, client_ip, rule


class RateLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_every_rule_exact_boundary_and_retry_header(self):
        for name in ['login_pair', 'login_email', 'login_ip', 'signup_ip', 'signup_email', 'refresh_ip', 'password_user', 'email_user', 'service_upload', 'avatar_upload', 'admin_upload']:
            with self.subTest(rule=name):
                now = [100.0]
                store = SlidingWindowStore(clock=lambda: now[0])
                selected = rule(name)
                entries = [(selected, 'subject')]
                for _ in range(selected.limit):
                    await store.check(entries, consume=True)
                with self.assertRaises(HTTPException) as caught:
                    await store.check(entries, consume=True)
                self.assertEqual(caught.exception.status_code, 429)
                self.assertEqual(caught.exception.detail, {'code': 'rate_limited', 'retry_after': selected.seconds})
                self.assertEqual(caught.exception.headers['Retry-After'], str(selected.seconds))
                now[0] += selected.seconds - .1
                with self.assertRaises(HTTPException) as caught:
                    await store.check(entries)
                self.assertEqual(caught.exception.detail['retry_after'], 1)
                now[0] += .1
                await store.check(entries, consume=True)

    async def test_success_resets_pair_only_and_check_does_not_consume(self):
        store = SlidingWindowStore()
        pair, email = rule('login_pair'), rule('login_email')
        entries = [(pair, 'ip:email'), (email, 'email')]
        await store.check(entries)
        await store.check(entries, consume=True)
        await store.reset(pair, 'ip:email')
        self.assertNotIn((pair.name, 'ip:email'), store.windows)
        self.assertEqual(len(store.windows[(email.name, 'email')][0]), 1)

    async def test_capacity_cleanup_evicts_expired_and_fails_closed_for_active(self):
        now = [0.0]
        store = SlidingWindowStore(clock=lambda: now[0], capacity=2)
        selected = rule('login_pair')
        await store.check([(selected, 'one')], consume=True)
        await store.check([(selected, 'two')], consume=True)
        with self.assertRaises(HTTPException):
            await store.check([(selected, 'three')], consume=True)
        self.assertEqual(len(store.windows), 2)
        now[0] = selected.seconds
        await store.cleanup()
        self.assertEqual(len(store.windows), 0)
        await store.check([(selected, 'three')], consume=True)

    async def test_concurrent_consumption_is_atomic(self):
        store = SlidingWindowStore()
        selected = rule('login_pair')
        async def consume():
            try:
                await store.check([(selected, 'same')], consume=True)
                return True
            except HTTPException:
                return False
        results = await asyncio.gather(*(consume() for _ in range(20)))
        self.assertEqual(sum(results), selected.limit)

    def test_proxy_header_ignored_by_default_and_counted_from_right(self):
        request = Request({'type': 'http', 'client': ('192.0.2.1', 1), 'headers': [(b'x-forwarded-for', b'198.51.100.2, 203.0.113.3')]})
        with patch('app.core.rate_limit.get_settings') as settings:
            settings.return_value.TRUSTED_PROXY_COUNT = 0
            self.assertEqual(client_ip(request), '192.0.2.1')
            settings.return_value.TRUSTED_PROXY_COUNT = 1
            self.assertEqual(client_ip(request), '203.0.113.3')
            settings.return_value.TRUSTED_PROXY_COUNT = 2
            self.assertEqual(client_ip(request), '198.51.100.2')
            settings.return_value.TRUSTED_PROXY_COUNT = 3
            self.assertEqual(client_ip(request), '192.0.2.1')
            settings.return_value.TRUSTED_PROXY_COUNT = 1
            invalid = Request({'type': 'http', 'client': ('192.0.2.1', 1), 'headers': [(b'x-forwarded-for', b'not-an-address')]})
            self.assertEqual(client_ip(invalid), '192.0.2.1')
