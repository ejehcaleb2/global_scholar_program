import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from tests import configure_test_environment
configure_test_environment()
import httpx
from sqlalchemy import delete, event, select
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AccessType, Masterclass, Opportunity, Profile, Resource, ResourceStatus, Subscription, SubscriptionPlan, SubscriptionStatus, User, UserRole


class AccessRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls):
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self):
        self.free, self.paid = uuid4(), uuid4()
        self.resources, self.sessions = [uuid4(), uuid4()], [uuid4(), uuid4()]
        self.opportunity = uuid4()
        async def create():
            async with AsyncSessionLocal() as db:
                for user_id in [self.free, self.paid]:
                    user = User(id=user_id, email=f'cfp-access-{user_id}@example.com', role=UserRole.student, hashed_password='unused')
                    user.profile = Profile(full_name='CFP Access')
                    db.add(user)
                await db.flush()
                db.add(Subscription(user_id=self.paid, plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=datetime.now(timezone.utc) + timedelta(hours=1)))
                for i, access in enumerate([AccessType.free, AccessType.members_only]):
                    db.add(Resource(id=self.resources[i], title='CFP Access', description='CFP preview', category='CFP', access_type=access, status=ResourceStatus.published, url='https://example.com/cfp-resource'))
                    db.add(Masterclass(id=self.sessions[i], title='CFP Access', speaker_name='CFP Access', session_datetime=datetime.now(timezone.utc) + timedelta(days=1), session_link='https://example.com/cfp-session', recording_url='https://example.com/cfp-recording', access_type=access))
                db.add(Opportunity(id=self.opportunity, name='CFP Access', category='CFP', deadline=datetime.now(timezone.utc) - timedelta(days=10000), external_link='https://example.com/cfp-opportunity', created_by=self.free))
                await db.commit()
        self.loop.run_until_complete(create())

    def tearDown(self):
        async def remove():
            async with AsyncSessionLocal() as db:
                counts = {}
                for model, criterion in [(Resource, Resource.id.in_(self.resources)), (Masterclass, Masterclass.id.in_(self.sessions)), (Opportunity, Opportunity.id == self.opportunity), (User, User.id.in_([self.free, self.paid]))]:
                    counts[model.__tablename__] = (await db.execute(delete(model).where(criterion))).rowcount
                await db.commit()
                print('CFP_ACCESS_ROWS_REMOVED', counts)
        self.loop.run_until_complete(remove())

    def headers(self, user_id):
        return {'Authorization': 'Bearer ' + create_access_token(str(user_id))} if user_id else {}

    def test_guest_preview_free_and_paid_unchanged_with_query_counts(self):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                for user_id in [None, self.free, self.paid]:
                    for path, field in [('/resources', 'url'), ('/opportunities', 'external_link'), ('/masterclasses', 'session_link')]:
                        queries = []
                        def capture(*args):
                            queries.append(1)
                        engine = AsyncSessionLocal.kw['bind'].sync_engine
                        event.listen(engine, 'before_cursor_execute', capture)
                        try:
                            response = await client.get(path, headers=self.headers(user_id))
                        finally:
                            event.remove(engine, 'before_cursor_execute', capture)
                        self.assertEqual(response.status_code, 200)
                        print('PREVIEW_SQL_QUERY_COUNT', path, 'guest' if not user_id else 'free' if user_id == self.free else 'paid', len(queries))
                        items = response.json()
                        if not user_id:
                            self.assertTrue(items)
                            for item in items:
                                self.assertTrue(item['locked'])
                                for key in ['url', 'external_link', 'session_link', 'recording_url', 'body_html']:
                                    self.assertIsNone(item.get(key))
                        else:
                            fixture_ids = self.resources if path == '/resources' else self.sessions if path == '/masterclasses' else [self.opportunity]
                            own = [item for item in items if item['id'] in {str(v) for v in fixture_ids}]
                            self.assertTrue(own)
                            for item in own:
                                locked = path == '/masterclasses' and user_id == self.free and item['access_type'] == 'members_only'
                                self.assertEqual(item['locked'], locked)
                                self.assertEqual(item[field] is None, locked)
                            if path == '/resources':
                                self.assertEqual(len(own), 1 if user_id == self.free else 2)
                        if path == '/opportunities' and user_id != self.paid:
                            self.assertLessEqual(len(items), 4)
        self.loop.run_until_complete(run())

    def test_every_plan_requires_active_and_future_non_null_end(self):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                for plan in SubscriptionPlan:
                    for seconds, status, expected in [(None, SubscriptionStatus.active, 'free'), (-1, SubscriptionStatus.active, 'free'), (3600, SubscriptionStatus.active, 'paid'), (3600, SubscriptionStatus.expired, 'free'), (3600, SubscriptionStatus.canceled, 'free')]:
                        async with AsyncSessionLocal() as db:
                            row = await db.scalar(select(Subscription).where(Subscription.user_id == self.paid))
                            row.plan, row.status = plan, status
                            row.current_period_end = datetime.now(timezone.utc) + timedelta(seconds=seconds) if seconds is not None else None
                            await db.commit()
                        response = await client.get('/membership', headers=self.headers(self.paid))
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.json()['tier'], expected)
                print('MEMBERSHIP_BOUNDARY_CASES', len(SubscriptionPlan) * 5)
        self.loop.run_until_complete(run())
