"""Explicit OpenAPI coverage with owner-approved narrow public auth exceptions."""
import asyncio
import re
import unittest
from collections import Counter
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from tests import configure_test_environment, credential
configure_test_environment()
import httpx
from sqlalchemy import delete
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import Profile, Subscription, SubscriptionPlan, SubscriptionStatus, User, UserRole

EXPECTATIONS = {
    ('POST', '/auth/signup'): 'public',
    ('POST', '/auth/login'): 'public',
    ('POST', '/auth/refresh'): 'public',
    ('GET', '/legal/current'): 'public',
    ('GET', '/legal/{document_type}'): 'public',
    ('GET', '/consents/status'): 'auth',
    ('POST', '/consents'): 'auth',
    ('GET', '/admin/courses'): 'admin',
    ('POST', '/admin/courses'): 'admin',
    ('GET', '/admin/courses/facets'): 'admin',
    ('GET', '/admin/courses/{course_id}/stats'): 'admin',
    ('GET', '/admin/courses/{course_id}/funnel'): 'admin',
    ('GET', '/admin/courses/{course_id}/learners'): 'admin',
    ('GET', '/admin/courses/{course_id}'): 'admin',
    ('PATCH', '/admin/courses/{course_id}'): 'admin',
    ('DELETE', '/admin/courses/{course_id}'): 'admin',
    ('GET', '/admin/impact/course/{course_id}'): 'admin',
    ('GET', '/admin/impact/module/{module_id}'): 'admin',
    ('GET', '/admin/impact/lesson/{lesson_id}'): 'admin',
    ('GET', '/admin/courses/{course_id}/readiness'): 'admin',
    ('POST', '/admin/courses/{course_id}/publish'): 'admin',
    ('POST', '/admin/courses/{course_id}/unpublish'): 'admin',
    ('POST', '/admin/courses/{course_id}/duplicate'): 'admin',
    ('POST', '/admin/courses/{course_id}/structure/reorder'): 'admin',
    ('GET', '/admin/resources'): 'admin',
    ('POST', '/admin/resources'): 'admin',
    ('GET', '/admin/opportunities'): 'admin',
    ('POST', '/admin/opportunities'): 'admin',
    ('GET', '/admin/masterclasses'): 'admin',
    ('POST', '/admin/masterclasses'): 'admin',
    ('POST', '/admin/courses/{course_id}/modules'): 'admin',
    ('PATCH', '/admin/courses/{course_id}/modules/{module_id}'): 'admin',
    ('DELETE', '/admin/courses/{course_id}/modules/{module_id}'): 'admin',
    ('POST', '/admin/modules/{module_id}/lessons'): 'admin',
    ('PATCH', '/admin/modules/{module_id}/lessons/{lesson_id}'): 'admin',
    ('DELETE', '/admin/modules/{module_id}/lessons/{lesson_id}'): 'admin',
    ('GET', '/admin/lessons/{lesson_id}/versions'): 'admin',
    ('GET', '/admin/lessons/{lesson_id}/versions/{version_id}'): 'admin',
    ('POST', '/admin/lessons/{lesson_id}/versions/{version_id}/restore'): 'admin',
    ('POST', '/admin/lessons/{lesson_id}/duplicate'): 'admin',
    ('PATCH', '/admin/resources/{resource_id}'): 'admin',
    ('DELETE', '/admin/resources/{resource_id}'): 'admin',
    ('PATCH', '/admin/opportunities/{opportunity_id}'): 'admin',
    ('DELETE', '/admin/opportunities/{opportunity_id}'): 'admin',
    ('PATCH', '/admin/masterclasses/{masterclass_id}'): 'admin',
    ('DELETE', '/admin/masterclasses/{masterclass_id}'): 'admin',
    ('GET', '/admin/stats'): 'admin',
    ('GET', '/admin/audit-logs'): 'admin',
    ('GET', '/admin/audit-logs/facets'): 'admin',
    ('GET', '/admin/audit-logs/{entry_id}'): 'admin',
    ('GET', '/admin/students'): 'admin',
    ('GET', '/admin/students/{student_id}'): 'admin',
    ('GET', '/courses'): 'public',
    ('GET', '/courses/{course_id}'): 'auth',
    ('GET', '/resources'): 'public',
    ('GET', '/opportunities'): 'public',
    ('GET', '/masterclasses'): 'public',
    ('POST', '/lessons/{lesson_id}/complete'): 'auth',
    ('DELETE', '/lessons/{lesson_id}/complete'): 'auth',
    ('GET', '/service-requests'): 'auth',
    ('POST', '/service-requests'): 'auth',
    ('GET', '/service-requests/{request_id}/document'): 'auth',
    ('GET', '/admin/service-requests'): 'admin',
    ('GET', '/admin/service-requests/{request_id}'): 'admin',
    ('PATCH', '/admin/service-requests/{request_id}/status'): 'admin',
    ('POST', '/admin/homepage-posts'): 'admin',
    ('GET', '/admin/homepage-posts'): 'admin',
    ('PATCH', '/admin/homepage-posts/{post_id}'): 'admin',
    ('DELETE', '/admin/homepage-posts/{post_id}'): 'admin',
    ('GET', '/admin/homepage-posts/{post_id}'): 'admin',
    ('POST', '/admin/homepage-posts/reorder'): 'admin',
    ('GET', '/homepage-posts'): 'public',
    ('GET', '/homepage-posts/{post_id}'): 'public',
    ('POST', '/admin/media'): 'admin',
    ('GET', '/media/public/{filename}'): 'public',
    ('GET', '/membership'): 'auth',
    ('GET', '/profile'): 'auth',
    ('PATCH', '/profile'): 'auth',
    ('POST', '/profile/email'): 'auth',
    ('POST', '/profile/password'): 'auth',
    ('POST', '/profile/avatar'): 'auth',
    ('GET', '/profile/avatar/{user_id}'): 'auth',
    ('GET', '/health'): 'public',
}


# Rejections are allowed only for these operation/input pairs, never for status 403.
PUBLIC_401_EXCEPTIONS = {
    ('POST', '/auth/login'): {
        'inputs': frozenset({'wrong_credentials'}),
        'reason': 'Login rejects the deliberately unknown email/password credential pair.',
    },
    ('POST', '/auth/refresh'): {
        'inputs': frozenset({'wrong_credentials'}),
        'reason': 'Refresh rejects the deliberately invalid refresh credential in the body.',
    },
    ('GET', '/courses'): {
        'inputs': frozenset({'invalid_token', 'expired_token', 'deactivated_token'}),
        'reason': 'Optional authentication validates any supplied token before granting a course preview.',
    },
    ('GET', '/resources'): {
        'inputs': frozenset({'invalid_token', 'expired_token', 'deactivated_token'}),
        'reason': 'Optional authentication rejects invalid credentials instead of treating a signed-in resource request as a guest.',
    },
    ('GET', '/opportunities'): {
        'inputs': frozenset({'invalid_token', 'expired_token', 'deactivated_token'}),
        'reason': 'The database-backed opportunity cap must use a valid active identity when a token is supplied.',
    },
    ('GET', '/masterclasses'): {
        'inputs': frozenset({'invalid_token', 'expired_token', 'deactivated_token'}),
        'reason': 'Masterclass links require valid optional authentication; invalid supplied tokens are rejected.',
    },
}
CREDENTIAL_REJECTIONS = {operation for operation, rule in PUBLIC_401_EXCEPTIONS.items() if 'wrong_credentials' in rule['inputs']}
OPTIONAL_AUTH_REJECTIONS = set(PUBLIC_401_EXCEPTIONS) - CREDENTIAL_REJECTIONS


def operations():
    return {(method.upper(), path) for path, item in app.openapi()['paths'].items() for method in item if method in {'get', 'post', 'put', 'patch', 'delete', 'options', 'head'}}


class AuthorizationMatrixTests(unittest.TestCase):
    def test_every_operation_has_exactly_one_explicit_expectation(self):
        self.assertEqual(set(EXPECTATIONS), operations())
        self.assertTrue(set(EXPECTATIONS.values()) <= {'public', 'auth', 'admin'})
        for operation, rule in PUBLIC_401_EXCEPTIONS.items():
            self.assertEqual(EXPECTATIONS.get(operation), 'public')
            self.assertTrue(rule['reason'].strip())
            self.assertTrue(rule['inputs'])
        print('AUTHZ_OPERATION_COUNTS', dict(Counter(EXPECTATIONS.values())), 'total', len(EXPECTATIONS))

    def assert_public_status(self, operation, code, rejection=None):
        self.assertNotEqual(code, 403, 'Public routes must never return 403')
        self.assertLess(code, 500)
        if code == 401:
            self.assertIn(operation, PUBLIC_401_EXCEPTIONS, 'Unlisted public 401 exception')
            self.assertIn(rejection, PUBLIC_401_EXCEPTIONS[operation]['inputs'],
                          'Public 401 is not allowed for this request input')

    def test_unlisted_exception_or_unlisted_input_fails(self):
        with self.assertRaisesRegex(AssertionError, 'Unlisted public 401 exception'):
            self.assert_public_status(('GET', '/health'), 401, 'invalid_token')
        with self.assertRaisesRegex(AssertionError, 'not allowed for this request input'):
            self.assert_public_status(('GET', '/courses'), 401, 'wrong_credentials')
        with self.assertRaisesRegex(AssertionError, 'never return 403'):
            self.assert_public_status(('GET', '/courses'), 403, 'invalid_token')
        print('AUTHZ_MUTATION_PROOF unlisted operation 401, unlisted input 401, and every public 403 rejected')

    def test_every_operation_as_guest_free_paid_admin_and_inactive(self):
        identities = {role: uuid4() for role in ['free', 'paid', 'admin', 'inactive']}
        async def run():
            try:
                async with AsyncSessionLocal() as db:
                    for role, identifier in identities.items():
                        user = User(id=identifier, email=f'rrp-matrix-{identifier}@example.com', role=UserRole.admin if role == 'admin' else UserRole.student, hashed_password='unused', is_active=role != 'inactive')
                        user.profile = Profile(full_name='RRP Matrix')
                        db.add(user)
                    await db.flush()
                    db.add(Subscription(user_id=identities['paid'], plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=datetime.now(timezone.utc) + timedelta(hours=1)))
                    await db.commit()
                calls, credential_rejections, inactive_rejections = 0, 0, 0
                headers = {role: {'Authorization': 'Bearer ' + create_access_token(str(identifier))} for role, identifier in identities.items()}
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    for (method, template), expected in EXPECTATIONS.items():
                        path = re.sub(r'\{[^}]+\}', str(uuid4()), template)
                        for role in ['guest', 'free', 'paid', 'admin', 'inactive']:
                            payload = {}
                            if (method, template) == ('POST', '/auth/login'):
                                payload = {'email': f'rrp-matrix-absent-{uuid4()}@example.com', 'password': credential()}
                            elif (method, template) == ('POST', '/auth/refresh'):
                                payload = {'refresh_token': 'cfp-invalid-refresh'}
                            response = await client.request(method, path, headers=headers.get(role, {}), **({'json': payload} if method in {'POST', 'PATCH', 'PUT'} else {}))
                            code = response.status_code
                            calls += 1
                            with self.subTest(operation=method + ' ' + template, role=role):
                                if expected != 'public' and role in {'guest', 'inactive'}:
                                    self.assertEqual(code, 401)
                                elif expected == 'admin' and role in {'free', 'paid'}:
                                    self.assertEqual(code, 403)
                                elif expected == 'public':
                                    rejection = ('wrong_credentials' if (method, template) in CREDENTIAL_REJECTIONS
                                                 else 'deactivated_token' if role == 'inactive' else None)
                                    self.assert_public_status((method, template), code, rejection)
                                    credential_rejections += int(code == 401 and rejection == 'wrong_credentials')
                                    inactive_rejections += int(code == 401 and rejection == 'deactivated_token')
                                elif expected == 'admin':
                                    self.assertNotIn(code, {401, 403})
                                    self.assertLess(code, 500)
                                else:
                                    self.assertNotEqual(code, 401)
                                    self.assertLess(code, 500)
                    token_calls = 0
                    expired = create_access_token(str(identities['free']), expires_delta=timedelta(seconds=-1))
                    for operation in OPTIONAL_AUTH_REJECTIONS:
                        for rejection, value in [('invalid_token', 'rrp-invalid-access'), ('expired_token', expired)]:
                            response = await client.get(operation[1], headers={'Authorization': 'Bearer ' + value})
                            self.assertEqual(response.status_code, 401)
                            self.assert_public_status(operation, response.status_code, rejection)
                            token_calls += 1
                    self.assertEqual(token_calls, 8)
                    print('AUTHZ_INVALID_EXPIRED_TOKEN_CALLS', token_calls)
                print('AUTHZ_EXCEPTION_OPERATION_COUNTS', 'credential', len(CREDENTIAL_REJECTIONS), 'optional', len(OPTIONAL_AUTH_REJECTIONS))
                print('AUTHZ_MATRIX_CALLS', calls)
                self.assertEqual(credential_rejections, 10)
                self.assertEqual(inactive_rejections, 4)
                print('AUTHZ_APPROVED_CREDENTIAL_401', credential_rejections)
                print('AUTHZ_APPROVED_INACTIVE_401', inactive_rejections)
            finally:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(delete(User).where(User.id.in_(identities.values())))
                    await db.commit()
                    print('RRP_MATRIX_USERS_REMOVED', result.rowcount)
                await AsyncSessionLocal.kw['bind'].dispose()
        asyncio.run(run())
