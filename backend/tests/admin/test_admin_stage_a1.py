from tests.media.test_images import image_bytes
from tests import configure_test_environment

configure_test_environment()

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest import TestCase

import httpx
from sqlalchemy import delete, event, func, select

from app.core.security import create_access_token
from app.core.storage import storage_backend
from app.db.session import AsyncSessionLocal, engine
from app.main import app
from app.models.gsp_models import (
    AuditLog,
    Course,
    CourseStatus,
    HomepagePost,
    Profile,
    ServiceRequest,
    ServiceStatus,
    Subscription,
    SubscriptionStatus,
    User,
    UserRole,
)


class AdminStageA1Tests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        cls.admin_id = uuid.uuid4()
        cls.student_id = uuid.uuid4()
        cls.loop.run_until_complete(cls._create_users())

    @classmethod
    async def _create_users(cls) -> None:
        async with AsyncSessionLocal() as session:
            admin = User(id=cls.admin_id, email=f'{cls.admin_id}@a1.test', hashed_password='unused', role=UserRole.admin)
            student = User(id=cls.student_id, email=f'{cls.student_id}@a1.test', hashed_password='unused', role=UserRole.student)
            admin.profile = Profile(full_name='A1 Admin')
            student.profile = Profile(full_name='A1 Student')
            session.add_all([admin, student])
            await session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(cls._cleanup_users())
        cls.loop.run_until_complete(cls.client.aclose())
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    @classmethod
    async def _cleanup_users(cls) -> None:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.actor_id == cls.admin_id))
            await session.execute(delete(User).where(User.id.in_([cls.admin_id, cls.student_id])))
            await session.commit()

    def setUp(self) -> None:
        self.post_ids: list[uuid.UUID] = []
        self.media_keys: list[str] = []
        self.seed_pin_orders = self.loop.run_until_complete(self._release_seed_pins())

    async def _release_seed_pins(self) -> list[tuple[uuid.UUID, int | None]]:
        async with AsyncSessionLocal() as session:
            posts = (await session.scalars(select(HomepagePost).where(HomepagePost.pinned.is_(True)))).all()
            saved = [(post.id, post.pin_order) for post in posts]
            for post in posts:
                post.pinned = False
                post.pin_order = None
            await session.commit()
            return saved

    def tearDown(self) -> None:
        self.loop.run_until_complete(self._cleanup_test_data())

    async def _cleanup_test_data(self) -> None:
        async with AsyncSessionLocal() as session:
            if self.post_ids:
                await session.execute(delete(AuditLog).where(AuditLog.entity_id.in_([str(value) for value in self.post_ids])))
                await session.execute(delete(HomepagePost).where(HomepagePost.id.in_(self.post_ids)))
            await session.execute(delete(AuditLog).where(AuditLog.actor_id == self.admin_id, AuditLog.entity_type == 'media'))
            for post_id, pin_order in self.seed_pin_orders:
                post = await session.get(HomepagePost, post_id)
                if post is not None:
                    post.pinned = True
                    post.pin_order = pin_order
            await session.commit()
        for key in self.media_keys:
            await storage_backend.delete(key)

    def headers(self, user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def create_post(self, title: str, *, pinned: bool = False, post_status: str = 'published') -> dict:
        response = self.loop.run_until_complete(
            self.client.post(
                '/admin/homepage-posts',
                headers=self.headers(self.admin_id),
                json={
                    'title': title,
                    'summary': 'A1 test summary',
                    'body_html': '<p>Safe body</p>',
                    'status': post_status,
                    'pinned': pinned,
                },
            )
        )
        self.assertEqual(response.status_code, 201, response.text)
        post = response.json()
        self.post_ids.append(uuid.UUID(post['id']))
        return post

    def test_audit_facets_use_static_route_and_require_admin(self) -> None:
        async def check():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as client:
                guest = await client.get('/admin/audit-logs/facets')
                student = await client.get('/admin/audit-logs/facets', headers=self.headers(self.student_id))
                queries = []
                def count_query(*_args):
                    queries.append(1)
                event.listen(engine.sync_engine, 'before_cursor_execute', count_query)
                try:
                    admin = await client.get('/admin/audit-logs/facets', headers=self.headers(self.admin_id))
                finally:
                    event.remove(engine.sync_engine, 'before_cursor_execute', count_query)
                self.assertEqual(guest.status_code, 401)
                self.assertEqual(student.status_code, 403)
                self.assertEqual(admin.status_code, 200)
                self.assertIn(str(self.admin_id), [item['value'] for item in admin.json()['admins']])
                self.assertEqual(len(queries), 4)  # Current-user authorization + three grouped facet queries.
                print(f'Audit facets SQL query count={len(queries)}')
        self.loop.run_until_complete(check())

    def test_stats_match_direct_database_counts(self) -> None:
        response = self.loop.run_until_complete(self.client.get('/admin/stats', headers=self.headers(self.admin_id)))
        self.assertEqual(response.status_code, 200, response.text)

        async def direct_counts() -> dict:
            now = datetime.now(timezone.utc)
            paid = (
                select(Subscription.id)
                .where(
                    Subscription.user_id == User.id,
                    Subscription.status == SubscriptionStatus.active,
                    Subscription.current_period_end.is_not(None),
                    Subscription.current_period_end > now,
                )
                .exists()
            )
            async with AsyncSessionLocal() as session:
                students = await session.execute(
                    select(
                        func.count(User.id),
                        func.count(User.id).filter(paid),
                        func.count(User.id).filter(User.created_at >= now - timedelta(days=7)),
                    ).where(User.role == UserRole.student, User.is_active.is_(True))
                )
                total, paid_count, recent_signups = students.one()
                requests = dict((await session.execute(select(ServiceRequest.status, func.count()).group_by(ServiceRequest.status))).all())
                courses = dict((await session.execute(select(Course.status, func.count()).group_by(Course.status))).all())
                return {
                    'students': {'total': total, 'paid': paid_count, 'free': total - paid_count},
                    'signups': {'last_7_days': recent_signups},
                    'service_requests': {
                        'pending': requests.get(ServiceStatus.submitted, 0) + requests.get(ServiceStatus.in_progress, 0),
                        'submitted': requests.get(ServiceStatus.submitted, 0),
                        'in_progress': requests.get(ServiceStatus.in_progress, 0),
                        'returned': requests.get(ServiceStatus.returned, 0),
                    },
                    'courses': {
                        'published': courses.get(CourseStatus.published, 0),
                        'draft': courses.get(CourseStatus.draft, 0),
                    },
                }

        self.assertEqual(response.json(), self.loop.run_until_complete(direct_counts()))

    def test_admin_endpoints_reject_students_and_guests(self) -> None:
        endpoints = [
            ('GET', '/admin/stats', None),
            ('GET', '/admin/audit-logs', None),
            ('GET', '/admin/service-requests', None),
            ('GET', '/admin/students', None),
            ('GET', '/admin/resources', None),
            ('GET', '/admin/opportunities', None),
            ('GET', '/admin/masterclasses', None),
            ('GET', '/admin/courses', None),
            ('GET', f'/admin/homepage-posts/{uuid.uuid4()}', None),
            ('POST', '/admin/homepage-posts/reorder', {'ordered_ids': [str(uuid.uuid4())]}),
        ]
        for method, path, body in endpoints:
            student_response = self.loop.run_until_complete(
                self.client.request(method, path, headers=self.headers(self.student_id), json=body)
            )
            guest_response = self.loop.run_until_complete(self.client.request(method, path, json=body))
            self.assertEqual(student_response.status_code, 403, f'{path}: {student_response.text}')
            self.assertEqual(guest_response.status_code, 401, f'{path}: {guest_response.text}')

        png = image_bytes(image_format='PNG')
        for headers, expected in [({'headers': self.headers(self.student_id)}, 403), ({}, 401)]:
            result = self.loop.run_until_complete(
                self.client.post('/admin/media', files={'file': ('a1.png', png, 'image/png')}, **headers)
            )
            self.assertEqual(result.status_code, expected, result.text)

    def test_admin_token_rechecks_role_and_active_state(self) -> None:
        headers = self.headers(self.admin_id)

        async def update_admin(role: UserRole, active: bool) -> None:
            async with AsyncSessionLocal() as session:
                admin = await session.get(User, self.admin_id)
                admin.role = role
                admin.is_active = active
                await session.commit()

        try:
            self.loop.run_until_complete(update_admin(UserRole.student, True))
            demoted = self.loop.run_until_complete(self.client.get('/admin/stats', headers=headers))
            self.assertEqual(demoted.status_code, 403, demoted.text)

            self.loop.run_until_complete(update_admin(UserRole.admin, False))
            deactivated = self.loop.run_until_complete(self.client.get('/admin/stats', headers=headers))
            self.assertEqual(deactivated.status_code, 401, deactivated.text)
        finally:
            self.loop.run_until_complete(update_admin(UserRole.admin, True))

    def test_pin_slot_reuse_unpublish_and_fourth_pin(self) -> None:
        initial = [self.create_post(f'h1-pin-{index}', pinned=True) for index in range(1, 4)]
        self.assertEqual([post['pin_order'] for post in initial], [1, 2, 3])

        unpin = self.loop.run_until_complete(
            self.client.patch(f"/admin/homepage-posts/{initial[0]['id']}", headers=self.headers(self.admin_id), json={'pinned': False})
        )
        self.assertEqual(unpin.status_code, 200)
        next_post = self.create_post('h1-pin-reuse', pinned=True)
        self.assertEqual(next_post['pin_order'], 1)

        fourth = self.loop.run_until_complete(
            self.client.post(
                '/admin/homepage-posts',
                headers=self.headers(self.admin_id),
                json={'title': 'h1-fourth', 'body_html': '<p>body</p>', 'status': 'published', 'pinned': True},
            )
        )
        self.assertEqual(fourth.status_code, 409)

        unpublish = self.loop.run_until_complete(
            self.client.patch(f"/admin/homepage-posts/{initial[1]['id']}", headers=self.headers(self.admin_id), json={'status': 'draft'})
        )
        self.assertEqual(unpublish.status_code, 200)
        self.assertEqual((unpublish.json()['pinned'], unpublish.json()['pin_order']), (False, None))

    def test_reorder_requires_exact_pinned_set_and_records_labels(self) -> None:
        first = self.create_post('h1-reorder-first', pinned=True)
        second = self.create_post('h1-reorder-second', pinned=True)
        queries = []
        def capture(*args):
            queries.append(1)
        event.listen(engine.sync_engine, 'before_cursor_execute', capture)
        success = self.loop.run_until_complete(
            self.client.post(
                '/admin/homepage-posts/reorder',
                headers=self.headers(self.admin_id),
                json={'ordered_ids': [second['id'], first['id']]},
            )
        )
        event.remove(engine.sync_engine, 'before_cursor_execute', capture)
        print('HOMEPAGE_REORDER_CHANGED_SQL_QUERY_COUNT', len(queries))
        self.assertEqual(success.status_code, 200, success.text)
        self.assertEqual([item['pin_order'] for item in success.json()], [1, 2])

        rejected = self.loop.run_until_complete(
            self.client.post(
                '/admin/homepage-posts/reorder',
                headers=self.headers(self.admin_id),
                json={'ordered_ids': [first['id']]},
            )
        )
        self.assertEqual(rejected.status_code, 409)

        async def reorder_audits() -> list[dict]:
            async with AsyncSessionLocal() as session:
                rows = await session.scalars(select(AuditLog).where(AuditLog.entity_id.in_([first['id'], second['id']]), AuditLog.action == 'reordered'))
                return [row.extra_data for row in rows]

        audits = self.loop.run_until_complete(reorder_audits())
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0]['affected_ids'], [second['id'], first['id']])
        self.assertIn('h1-reorder-first', audits[0]['label'])
        self.assertIn('h1-reorder-second', audits[0]['label'])
        print('HOMEPAGE_REORDER_AUDITS', len(audits), 'affected_ids', len(audits[0]['affected_ids']))

    def test_public_post_only_returns_published_and_sanitizes_on_read(self) -> None:
        published = self.create_post('h1-public-post')
        draft = self.create_post('h1-private-post', post_status='draft')

        async def inject_unsafe_body(post_id: str) -> None:
            async with AsyncSessionLocal() as session:
                post = await session.get(HomepagePost, uuid.UUID(post_id))
                post.body_html = '<p>safe</p><script>alert(1)</script>'
                await session.commit()

        self.loop.run_until_complete(inject_unsafe_body(published['id']))
        public = self.loop.run_until_complete(self.client.get(f"/homepage-posts/{published['id']}"))
        hidden = self.loop.run_until_complete(self.client.get(f"/homepage-posts/{draft['id']}"))
        self.assertEqual(public.status_code, 200)
        self.assertNotIn('<script', public.json()['body_html'])
        self.assertEqual(hidden.status_code, 404)

    def test_media_accepts_sniffed_image_and_rejects_invalid_files_and_paths(self) -> None:
        valid = image_bytes(image_format='PNG')
        uploaded = self.loop.run_until_complete(
            self.client.post('/admin/media', headers=self.headers(self.admin_id), files={'file': ('renamed.bin', valid, 'application/octet-stream')})
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        url = uploaded.json()['url']
        filename = url.rsplit('/', 1)[1]
        self.media_keys.append(f'public/{filename}')
        public = self.loop.run_until_complete(self.client.get(f'/media/public/{filename}'))
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.headers['content-type'], 'image/png')
        self.assertEqual(public.headers['x-content-type-options'], 'nosniff')
        self.assertEqual(public.headers['cross-origin-resource-policy'], 'cross-origin')
        self.assertIn('immutable', public.headers['cache-control'])

        invalid_files = [
            ('a1.svg', b'<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'),
            ('renamed.png', b'MZ\x00\x00h1-executable', 'image/png'),
            ('h1-large.png', b'\x89PNG\r\n\x1a\n' + b'x' * (5 * 1024 * 1024), 'image/png'),
        ]
        for name, content, content_type in invalid_files:
            response = self.loop.run_until_complete(
                self.client.post('/admin/media', headers=self.headers(self.admin_id), files={'file': (name, content, content_type)})
            )
            self.assertEqual(response.status_code, 413 if name == 'h1-large.png' else 415, response.text)

        traversal = self.loop.run_until_complete(self.client.get('/media/public/%2e%2e%2f%2e%2e%2f.env'))
        self.assertIn(traversal.status_code, (404, 422))
        for invalid_name in (
            '11111111111141118111111111111111.png',
            '11111111-1111-4111-8111-111111111111-640.webp',
        ):
            invalid_media = self.loop.run_until_complete(self.client.get(f'/media/public/{invalid_name}'))
            self.assertEqual(invalid_media.status_code, 404, invalid_name)


if __name__ == '__main__':
    import unittest

    unittest.main()
