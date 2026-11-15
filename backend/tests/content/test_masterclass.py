from tests import configure_test_environment

configure_test_environment()

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest import TestCase

import httpx
from sqlalchemy import delete, select

from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AuditLog, Masterclass, Subscription, SubscriptionPlan, SubscriptionStatus, User, UserRole


class MasterclassTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        cls.loop.run_until_complete(cls.create_fixtures())

    @classmethod
    async def create_fixtures(cls) -> None:
        cls.admin_id = uuid.uuid4()
        cls.paid_id = uuid.uuid4()
        cls.free_id = uuid.uuid4()
        async with AsyncSessionLocal() as session:
            admin = User(id=cls.admin_id, email=f'{cls.admin_id}@masterclass.test', hashed_password='unused', role=UserRole.admin)
            paid = User(id=cls.paid_id, email=f'{cls.paid_id}@masterclass.test', hashed_password='unused', role=UserRole.student)
            free = User(id=cls.free_id, email=f'{cls.free_id}@masterclass.test', hashed_password='unused', role=UserRole.student)
            paid.subscriptions = [Subscription(plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=datetime.now(timezone.utc) + timedelta(days=30))]
            session.add_all([admin, paid, free])
            await session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(cls.cleanup())
        cls.loop.run_until_complete(cls.client.aclose())
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    @classmethod
    async def cleanup(cls) -> None:
        async with AsyncSessionLocal() as session:
            ids = [cls.admin_id, cls.paid_id, cls.free_id]
            masterclass_ids = [value for value in (await session.scalars(select(Masterclass.id).where(Masterclass.title.like('Test Masterclass %')))).all()]
            await session.execute(delete(AuditLog).where(AuditLog.actor_id.in_(ids)))
            if masterclass_ids:
                await session.execute(delete(AuditLog).where(AuditLog.entity_id.in_([str(value) for value in masterclass_ids])))
                await session.execute(delete(Masterclass).where(Masterclass.id.in_(masterclass_ids)))
            await session.execute(delete(Subscription).where(Subscription.user_id == cls.paid_id))
            await session.execute(delete(User).where(User.id.in_(ids)))
            await session.commit()

    @staticmethod
    def headers(user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def test_masterclass_access_and_past_state(self) -> None:
        now = datetime.now(timezone.utc)
        create_free = self.loop.run_until_complete(self.client.post('/admin/masterclasses', headers=self.headers(self.admin_id), json={
            'title': 'Test Masterclass Free', 'speaker_name': 'Speaker', 'description': 'Free session',
            'session_datetime': (now - timedelta(days=1)).isoformat(), 'session_link': 'https://free.example/join',
            'access_type': 'free', 'recording_url': 'https://free.example/recording',
        }))
        create_members = self.loop.run_until_complete(self.client.post('/admin/masterclasses', headers=self.headers(self.admin_id), json={
            'title': 'Test Masterclass Members', 'speaker_name': 'Speaker', 'description': 'Members session',
            'session_datetime': (now + timedelta(days=1)).isoformat(), 'session_link': 'https://members.example/join',
            'access_type': 'members_only', 'recording_url': 'https://members.example/recording',
        }))
        self.assertEqual(create_free.status_code, 201)
        self.assertEqual(create_members.status_code, 201)

        free_response = self.loop.run_until_complete(self.client.get('/masterclasses', headers=self.headers(self.free_id)))
        paid_response = self.loop.run_until_complete(self.client.get('/masterclasses', headers=self.headers(self.paid_id)))
        free_items = {item['title']: item for item in free_response.json()}
        paid_items = {item['title']: item for item in paid_response.json()}
        self.assertFalse(free_items['Test Masterclass Free']['locked'])
        self.assertTrue(free_items['Test Masterclass Free']['is_past'])
        self.assertTrue(free_items['Test Masterclass Members']['locked'])
        self.assertIsNone(free_items['Test Masterclass Members']['session_link'])
        self.assertIsNone(free_items['Test Masterclass Members']['recording_url'])
        self.assertFalse(paid_items['Test Masterclass Members']['is_past'])
        self.assertEqual(paid_items['Test Masterclass Members']['session_link'], 'https://members.example/join')
        self.assertEqual(paid_items['Test Masterclass Members']['recording_url'], 'https://members.example/recording')

    def test_admin_crud_and_non_admin_denial(self) -> None:
        denied = self.loop.run_until_complete(self.client.post('/admin/masterclasses', headers=self.headers(self.free_id), json={
            'title': 'Denied Masterclass', 'speaker_name': 'Speaker', 'session_datetime': datetime.now(timezone.utc).isoformat(),
            'session_link': 'https://example.com/join', 'access_type': 'free',
        }))
        self.assertEqual(denied.status_code, 403)

        created = self.loop.run_until_complete(self.client.post('/admin/masterclasses', headers=self.headers(self.admin_id), json={
            'title': 'Test Masterclass CRUD', 'speaker_name': 'Speaker', 'session_datetime': datetime.now(timezone.utc).isoformat(),
            'session_link': 'https://example.com/join', 'access_type': 'free',
        }))
        masterclass_id = created.json()['id']
        updated = self.loop.run_until_complete(self.client.patch(f'/admin/masterclasses/{masterclass_id}', headers=self.headers(self.admin_id), json={'title': 'Test Masterclass CRUD Updated'}))
        deleted = self.loop.run_until_complete(self.client.delete(f'/admin/masterclasses/{masterclass_id}', headers=self.headers(self.admin_id)))
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()['title'], 'Test Masterclass CRUD Updated')
        self.assertEqual(deleted.status_code, 204)
