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
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import (
    AuditLog,
    ServiceRequest,
    ServiceRequestEvent,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    User,
    UserRole,
)


PDF_BYTES = b'%PDF-1.7\nStage 7 test PDF\n%%EOF\n'


class ServiceRequestTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        cls.loop.run_until_complete(cls.create_fixtures())

    @classmethod
    async def create_fixtures(cls) -> None:
        cls.admin_id = uuid.uuid4()
        cls.owner_id = uuid.uuid4()
        cls.other_id = uuid.uuid4()
        cls.free_id = uuid.uuid4()
        async with AsyncSessionLocal() as session:
            admin = User(id=cls.admin_id, email=f'{cls.admin_id}@service.test', hashed_password='unused', role=UserRole.admin)
            owner = User(id=cls.owner_id, email=f'{cls.owner_id}@service.test', hashed_password='unused', role=UserRole.student)
            other = User(id=cls.other_id, email=f'{cls.other_id}@service.test', hashed_password='unused', role=UserRole.student)
            free = User(id=cls.free_id, email=f'{cls.free_id}@service.test', hashed_password='unused', role=UserRole.student)
            owner.subscriptions = [Subscription(plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=datetime.now(timezone.utc) + timedelta(days=30))]
            session.add_all([admin, owner, other, free])
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
            requests = (await session.scalars(select(ServiceRequest).where(ServiceRequest.user_id.in_([cls.owner_id, cls.other_id, cls.free_id])))).all()
            keys = [request.document_url for request in requests if request.document_url]
            request_ids = [request.id for request in requests]
            if request_ids:
                await session.execute(delete(AuditLog).where(AuditLog.entity_id.in_([str(value) for value in request_ids])))
                await session.execute(delete(ServiceRequestEvent).where(ServiceRequestEvent.service_request_id.in_(request_ids)))
                await session.execute(delete(ServiceRequest).where(ServiceRequest.id.in_(request_ids)))
            await session.execute(delete(Subscription).where(Subscription.user_id == cls.owner_id))
            await session.execute(delete(User).where(User.id.in_([cls.admin_id, cls.owner_id, cls.other_id, cls.free_id])))
            await session.commit()
        for key in keys:
            await storage_backend.delete(key)

    @staticmethod
    def headers(user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def submit(self, user_id: uuid.UUID, filename: str = 'essay.pdf', content: bytes = PDF_BYTES) -> httpx.Response:
        return self.loop.run_until_complete(
            self.client.post(
                '/service-requests',
                headers=self.headers(user_id),
                data={'service_type': 'essay_review'},
                files={'file': (filename, content, 'application/pdf')},
            )
        )

    def test_paid_submission_creates_request_and_event(self) -> None:
        response = self.submit(self.owner_id)
        self.assertEqual(response.status_code, 201)
        request_id = response.json()['id']
        self.request_id = request_id
        self.loop.run_until_complete(self.assert_counts(request_id, 1, 1))

    async def assert_counts(self, request_id: str, request_count: int, event_count: int) -> None:
        async with AsyncSessionLocal() as session:
            request_rows = await session.scalar(select(func.count()).select_from(ServiceRequest).where(ServiceRequest.id == request_id))
            event_rows = await session.scalar(select(func.count()).select_from(ServiceRequestEvent).where(ServiceRequestEvent.service_request_id == request_id))
        self.assertEqual(request_rows, request_count)
        self.assertEqual(event_rows, event_count)

    def test_free_submission_is_denied_and_bad_files_rejected(self) -> None:
        self.assertEqual(self.submit(self.free_id).status_code, 403)
        self.assertEqual(self.submit(self.owner_id, filename='fake.pdf', content=b'plain text, not a PDF').status_code, 415)
        self.assertEqual(self.submit(self.owner_id, filename='large.pdf', content=b'%PDF-' + b'x' * (10 * 1024 * 1024 + 1)).status_code, 413)

    def test_document_access_and_admin_queue(self) -> None:
        response = self.submit(self.owner_id)
        request_id = response.json()['id']
        self.request_id = request_id
        mine = self.loop.run_until_complete(self.client.get(f'/service-requests/{request_id}/document', headers=self.headers(self.owner_id)))
        other = self.loop.run_until_complete(self.client.get(f'/service-requests/{request_id}/document', headers=self.headers(self.other_id)))
        admin = self.loop.run_until_complete(self.client.get(f'/service-requests/{request_id}/document', headers=self.headers(self.admin_id)))
        queue = self.loop.run_until_complete(self.client.get('/admin/service-requests?status=submitted', headers=self.headers(self.admin_id)))
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(mine.content, PDF_BYTES)
        self.assertEqual(other.status_code, 403)
        self.assertEqual(admin.status_code, 200)
        self.assertEqual(admin.content, PDF_BYTES)
        self.assertEqual(queue.status_code, 200)
        self.assertTrue(any(item['id'] == request_id for item in queue.json()))

    def test_admin_transitions_create_events_and_audit(self) -> None:
        response = self.submit(self.owner_id)
        request_id = response.json()['id']
        self.request_id = request_id
        in_progress = self.loop.run_until_complete(self.client.patch(f'/admin/service-requests/{request_id}/status', headers=self.headers(self.admin_id), json={'status': 'in_progress'}))
        returned = self.loop.run_until_complete(self.client.patch(f'/admin/service-requests/{request_id}/status', headers=self.headers(self.admin_id), json={'status': 'returned'}))
        self.assertEqual(in_progress.status_code, 200)
        self.assertEqual(returned.status_code, 200)
        self.loop.run_until_complete(self.assert_transition_counts(request_id))

    async def assert_transition_counts(self, request_id: str) -> None:
        async with AsyncSessionLocal() as session:
            events = (await session.scalars(select(ServiceRequestEvent).where(ServiceRequestEvent.service_request_id == request_id).order_by(ServiceRequestEvent.changed_at))).all()
            audits = await session.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == 'service_request', AuditLog.entity_id == request_id))
        self.assertEqual([(event.from_status.value if event.from_status else None, event.to_status.value) for event in events], [(None, 'submitted'), ('submitted', 'in_progress'), ('in_progress', 'returned')])
        self.assertEqual(audits, 2)

    def test_admin_detail_history_denies_students_and_has_bounded_queries(self) -> None:
        submitted = self.submit(self.owner_id)
        self.assertEqual(submitted.status_code, 201)
        request_id = submitted.json()['id']
        for user_id in [self.owner_id, self.other_id, self.free_id]:
            denied = self.loop.run_until_complete(self.client.get(f'/admin/service-requests/{request_id}', headers=self.headers(user_id)))
            self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.loop.run_until_complete(self.client.get(f'/admin/service-requests/{request_id}')).status_code, 401)
        self.assertEqual(self.loop.run_until_complete(self.client.get(f'/admin/service-requests/{uuid.uuid4()}', headers=self.headers(self.admin_id))).status_code, 404)
        selects = []
        engine = AsyncSessionLocal.kw['bind'].sync_engine
        def capture(_connection, _cursor, statement, _parameters, _context, _many):
            if statement.lstrip().upper().startswith('SELECT'):
                selects.append(statement)
        event.listen(engine, 'before_cursor_execute', capture)
        try:
            detail = self.loop.run_until_complete(self.client.get(f'/admin/service-requests/{request_id}', headers=self.headers(self.admin_id)))
        finally:
            event.remove(engine, 'before_cursor_execute', capture)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(selects), 3, 'One authentication SELECT and two eager-loaded data SELECTs')
        print('ADMIN_REQUEST_DETAIL_SELECTS', len(selects), 'data=2 auth=1')
        body = detail.json()
        self.assertTrue(body['has_document'])
        self.assertNotIn('document_url', body)
        self.assertNotIn('hashed_password', detail.text)
        self.assertEqual([(item['from_status'], item['to_status']) for item in body['events']], [(None, 'submitted')])
        self.assertEqual(body['events'][0]['actor']['id'], str(self.owner_id))
        changed = self.loop.run_until_complete(self.client.patch(f'/admin/service-requests/{request_id}/status', headers=self.headers(self.admin_id), json={'status': 'in_progress'}))
        self.assertEqual(changed.status_code, 200)
        updated = self.loop.run_until_complete(self.client.get(f'/admin/service-requests/{request_id}', headers=self.headers(self.admin_id)))
        self.assertEqual([item['to_status'] for item in updated.json()['events']], ['submitted', 'in_progress'])
        self.assertEqual(updated.json()['events'][-1]['actor']['id'], str(self.admin_id))
        async def audit_count():
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == 'service_request', AuditLog.entity_id == request_id))
        self.assertEqual(self.loop.run_until_complete(audit_count()), 1, 'Reads add no audit rows; the single successful mutation adds one')

    def test_pending_and_student_filters_page_in_sql(self) -> None:
        first = self.submit(self.owner_id)
        second = self.submit(self.owner_id)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        returned_id = first.json()['id']
        for status in ['in_progress', 'returned']:
            changed = self.loop.run_until_complete(self.client.patch(f'/admin/service-requests/{returned_id}/status', headers=self.headers(self.admin_id), json={'status': status}))
            self.assertEqual(changed.status_code, 200)
        selects = []
        engine = AsyncSessionLocal.kw['bind'].sync_engine
        def capture(_connection, _cursor, statement, _parameters, _context, _many):
            if statement.lstrip().upper().startswith('SELECT'):
                selects.append(statement)
        event.listen(engine, 'before_cursor_execute', capture)
        try:
            page = self.loop.run_until_complete(self.client.get(f'/admin/service-requests?paginated=true&pending=true&user_id={self.owner_id}&limit=1', headers=self.headers(self.admin_id)))
        finally:
            event.remove(engine, 'before_cursor_execute', capture)
        self.assertEqual(page.status_code, 200)
        self.assertEqual(len(selects), 3, 'One authentication SELECT plus count and paginated data')
        print('ADMIN_REQUEST_LIST_SELECTS', len(selects), 'data=2 auth=1')
        self.assertEqual(len(page.json()['items']), 1)
        all_pending = self.loop.run_until_complete(self.client.get(f'/admin/service-requests?pending=true&user_id={self.owner_id}&limit=100', headers=self.headers(self.admin_id))).json()
        self.assertTrue(all(item['user_id'] == str(self.owner_id) and item['status'] in ['submitted', 'in_progress'] for item in all_pending))
        self.assertNotIn(returned_id, [item['id'] for item in all_pending])
        self.assertIn(second.json()['id'], [item['id'] for item in all_pending])
        self.assertEqual([item['created_at'] for item in all_pending], sorted(item['created_at'] for item in all_pending))
        self.assertEqual(page.json()['total'], len(all_pending))
        self.assertEqual(page.json()['items'][0]['id'], all_pending[0]['id'])
        empty = self.loop.run_until_complete(self.client.get(f'/admin/service-requests?paginated=true&user_id={self.free_id}', headers=self.headers(self.admin_id)))
        self.assertEqual(empty.json()['items'], [])
        self.assertEqual(empty.json()['total'], 0)

    def test_concurrent_status_changes_do_not_duplicate_a_transition(self) -> None:
        request_id = self.submit(self.owner_id).json()['id']
        async def race():
            return await asyncio.gather(*[self.client.patch(f'/admin/service-requests/{request_id}/status', headers=self.headers(self.admin_id), json={'status': 'in_progress'}) for _ in range(2)])
        self.assertEqual(sorted(response.status_code for response in self.loop.run_until_complete(race())), [200, 400])
        detail = self.loop.run_until_complete(self.client.get(f'/admin/service-requests/{request_id}', headers=self.headers(self.admin_id))).json()
        self.assertEqual([item['to_status'] for item in detail['events']], ['submitted', 'in_progress'])
