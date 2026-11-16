from tests import configure_test_environment

configure_test_environment()

import asyncio
import uuid
from unittest import TestCase

import httpx
from sqlalchemy import delete, select

from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AuditLog, HomepagePost, User, UserRole


class HomepagePostTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        cls.loop.run_until_complete(cls.create_fixtures())

    @classmethod
    async def create_fixtures(cls) -> None:
        cls.admin_id = uuid.uuid4()
        cls.student_id = uuid.uuid4()
        async with AsyncSessionLocal() as session:
            session.add_all([
                User(id=cls.admin_id, email=f'{cls.admin_id}@homepage.test', hashed_password='unused', role=UserRole.admin),
                User(id=cls.student_id, email=f'{cls.student_id}@homepage.test', hashed_password='unused', role=UserRole.student),
            ])
            await session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(cls.cleanup())
        cls.loop.run_until_complete(cls.client.aclose())
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self) -> None:
        self.seed_pin_orders = self.release_seed_pins()
        self.loop.run_until_complete(self.cleanup_posts())

    def tearDown(self) -> None:
        self.restore_seed_pins()

    def release_seed_pins(self) -> list[tuple[uuid.UUID, int | None]]:
        async def release() -> list[tuple[uuid.UUID, int | None]]:
            async with AsyncSessionLocal() as session:
                posts = (await session.scalars(select(HomepagePost).where(HomepagePost.pinned.is_(True)))).all()
                saved = [(post.id, post.pin_order) for post in posts if not post.title.startswith('Test Homepage ')]
                for post in posts:
                    if not post.title.startswith('Test Homepage '):
                        post.pinned = False
                        post.pin_order = None
                await session.commit()
                return saved
        return self.loop.run_until_complete(release())

    def restore_seed_pins(self) -> None:
        async def restore() -> None:
            async with AsyncSessionLocal() as session:
                for post_id, pin_order in self.seed_pin_orders:
                    post = await session.get(HomepagePost, post_id)
                    if post is not None:
                        post.pinned = True
                        post.pin_order = pin_order
                await session.commit()
        self.loop.run_until_complete(restore())

    @classmethod
    async def cleanup(cls) -> None:
        await cls.cleanup_posts()
        async with AsyncSessionLocal() as session:
            await session.execute(delete(User).where(User.id.in_([cls.admin_id, cls.student_id])))
            await session.commit()

    @classmethod
    async def cleanup_posts(cls) -> None:
        async with AsyncSessionLocal() as session:
            post_ids = [value for value in (await session.scalars(select(HomepagePost.id).where(HomepagePost.title.like('Test Homepage %')))).all()]
            if post_ids:
                await session.execute(delete(AuditLog).where(AuditLog.entity_id.in_([str(value) for value in post_ids])))
                await session.execute(delete(HomepagePost).where(HomepagePost.id.in_(post_ids)))
            await session.commit()

    @staticmethod
    def headers(user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def create(self, **values) -> httpx.Response:
        payload = {
            'title': values.get('title', f'Test Homepage {uuid.uuid4()}'),
            'body_html': values.get('body_html', '<p>Body</p>'),
            'status': values.get('status', 'published'),
            'pinned': values.get('pinned', False),
            **{key: value for key, value in values.items() if key not in {'title', 'body_html', 'status', 'pinned'}},
        }
        return self.loop.run_until_complete(self.client.post('/admin/homepage-posts', headers=self.headers(self.admin_id), json=payload))

    def test_multimedia_sections_persist_order_sanitize_and_remain_private(self) -> None:
        sections = [
            {'id': str(uuid.uuid4()), 'type': 'text', 'body_html': '<h2>Guide</h2><script>alert(1)</script><a href="javascript:alert(1)">unsafe</a>'},
            {'id': str(uuid.uuid4()), 'type': 'image', 'url': 'https://example.org/photo.jpg', 'alt': 'Students studying', 'caption': 'Program photo'},
            {'id': str(uuid.uuid4()), 'type': 'video', 'url': 'https://youtu.be/jNQXAC9IVRw', 'caption': 'Video introduction'},
        ]
        created = self.create(status='draft', sections=sections)
        self.assertEqual(created.status_code, 201, created.text)
        post_id = created.json()['id']
        saved = created.json()['sections']
        self.assertEqual([item['type'] for item in saved], ['text', 'image', 'video'])
        self.assertNotIn('<script', saved[0]['body_html'])
        self.assertNotIn('href="javascript:', saved[0]['body_html'])
        self.assertEqual(saved[2]['url'], 'https://www.youtube.com/watch?v=jNQXAC9IVRw')
        self.assertEqual(self.loop.run_until_complete(self.client.get(f'/homepage-posts/{post_id}')).status_code, 404)
        denied = self.loop.run_until_complete(self.client.patch(f'/admin/homepage-posts/{post_id}', headers=self.headers(self.student_id), json={'sections': []}))
        self.assertEqual(denied.status_code, 403)
        updated = self.loop.run_until_complete(self.client.patch(f'/admin/homepage-posts/{post_id}', headers=self.headers(self.admin_id), json={'status': 'published', 'sections': list(reversed(sections)), 'expected_updated_at': created.json()['updated_at']}))
        self.assertEqual(updated.status_code, 200, updated.text)
        public = self.loop.run_until_complete(self.client.get(f'/homepage-posts/{post_id}'))
        self.assertEqual(public.status_code, 200)
        self.assertEqual([item['type'] for item in public.json()['sections']], ['video', 'image', 'text'])
        stale = self.loop.run_until_complete(self.client.patch(f'/admin/homepage-posts/{post_id}', headers=self.headers(self.admin_id), json={'sections': [], 'expected_updated_at': created.json()['updated_at']}))
        self.assertEqual(stale.status_code, 409)
        async def audit():
            async with AsyncSessionLocal() as session:
                return (await session.scalars(select(AuditLog).where(AuditLog.entity_id == post_id))).all()
        logs = self.loop.run_until_complete(audit())
        self.assertEqual(len(logs), 2)
        self.assertNotIn('Students studying', str([row.extra_data for row in logs]))

    def test_section_validation_rejects_unsafe_or_invalid_content(self) -> None:
        invalid = [
            {'type': 'image', 'url': 'javascript:alert(1)', 'alt': 'Photo'},
            {'type': 'image', 'url': 'https://example.org/photo.jpg', 'alt': ' '},
            {'type': 'video', 'url': 'https://evil.example/embed/test'},
            {'type': 'video', 'url': 'http://youtube.com/watch?v=jNQXAC9IVRw'},
            {'type': 'text', 'body_html': '<p> </p>'},
            {'type': 'iframe', 'url': 'https://example.org'},
        ]
        for section in invalid:
            with self.subTest(section=section['type']):
                self.assertEqual(self.create(sections=[{'id': str(uuid.uuid4()), **section}]).status_code, 422)
        section = {'id': str(uuid.uuid4()), 'type': 'text', 'body_html': '<p>Valid</p>'}
        self.assertEqual(self.create(sections=[section, section]).status_code, 422)
        self.assertEqual(self.create(sections=[{**section, 'id': str(uuid.uuid4())} for _ in range(51)]).status_code, 422)
        legacy = self.create()
        self.assertEqual(legacy.status_code, 201)
        self.assertEqual(legacy.json()['sections'], [])

    def test_pinning_rules_and_published_at_preservation(self) -> None:
        draft = self.create(title='Test Homepage Draft', status='draft', pinned=True)
        self.assertEqual(draft.status_code, 422)
        published = self.create(title='Test Homepage Published', pinned=True)
        self.assertEqual(published.status_code, 201)
        post_id = published.json()['id']
        published_at = published.json()['published_at']
        edited = self.loop.run_until_complete(self.client.patch(f'/admin/homepage-posts/{post_id}', headers=self.headers(self.admin_id), json={'title': 'Test Homepage Published Edited'}))
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()['published_at'], published_at)
        for index in range(2):
            self.assertEqual(self.create(title=f'Test Homepage Pinned {index}', pinned=True).status_code, 201)
        self.assertEqual(self.create(title='Test Homepage Fourth', pinned=True).status_code, 409)

    def test_unpinning_clears_order_and_records_unpinned_action(self) -> None:
        created = self.create(title='Test Homepage Unpin', pinned=True)
        self.assertEqual(created.status_code, 201)
        post_id = created.json()['id']

        response = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/homepage-posts/{post_id}',
                headers=self.headers(self.admin_id),
                json={'pinned': False},
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['pinned'])
        self.assertIsNone(response.json()['pin_order'])

        async def get_actions() -> list[str]:
            async with AsyncSessionLocal() as session:
                return list(
                    (
                        await session.scalars(
                            select(AuditLog.action).where(
                                AuditLog.entity_type == 'homepage_post',
                                AuditLog.entity_id == post_id,
                            )
                        )
                    ).all()
                )

        self.assertCountEqual(self.loop.run_until_complete(get_actions()), ['created', 'unpinned'])

    def test_public_pinned_then_fallback_and_no_drafts(self) -> None:
        pinned = self.create(title='Test Homepage Pinned Public', pinned=True)
        self.assertEqual(pinned.status_code, 201)
        self.assertEqual(self.create(title='Test Homepage Latest A').status_code, 201)
        self.assertEqual(self.create(title='Test Homepage Latest B').status_code, 201)
        draft = self.create(title='Test Homepage Draft Public', status='draft')
        self.assertEqual(draft.status_code, 201)
        response = self.loop.run_until_complete(self.client.get('/homepage-posts'))
        self.assertEqual(response.status_code, 200)
        titles = [post['title'] for post in response.json()]
        self.assertEqual(titles[0], 'Test Homepage Pinned Public')
        self.assertNotIn('Test Homepage Draft Public', titles)
        self.assertEqual(len(titles), 3)

    def test_non_admin_is_denied_admin_endpoints(self) -> None:
        payload = {'title': 'Test Homepage Denied', 'body_html': '<p>Denied</p>', 'status': 'draft', 'pinned': False}
        response = self.loop.run_until_complete(self.client.post('/admin/homepage-posts', headers=self.headers(self.student_id), json=payload))
        listing = self.loop.run_until_complete(self.client.get('/admin/homepage-posts', headers=self.headers(self.student_id)))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(listing.status_code, 403)
