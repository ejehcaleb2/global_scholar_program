"""HTTP regressions for stale editors, validation and audit integrity."""
from tests import configure_test_environment
configure_test_environment()

import asyncio
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from uuid import uuid4

import httpx
from sqlalchemy import delete, event, func, select

from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AuditLog, User, UserRole


class ContentEditSafetyTests(TestCase):
    def test_stale_updates_do_not_overwrite_or_add_audit_rows(self):
        asyncio.run(self._exercise())

    async def _exercise(self):
        admin_id = uuid4()
        created = []
        async with AsyncSessionLocal() as db:
            db.add(User(id=admin_id, email=f'admin-fixes-{admin_id}@example.test', hashed_password='unused', role=UserRole.admin))
            await db.commit()
        headers = {'Authorization': f'Bearer {create_access_token(str(admin_id))}'}
        cases = [
            ('resources', {'title': 'admin-fixes-resource', 'category': 'Tests', 'access_type': 'free', 'status': 'draft', 'url': 'https://example.com/resource'}, 'title', 'url'),
            ('opportunities', {'name': 'admin-fixes-opportunity', 'category': 'Tests', 'external_link': 'https://example.com/apply'}, 'name', 'external_link'),
            ('masterclasses', {'title': 'admin-fixes-session', 'speaker_name': 'Test speaker', 'session_datetime': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), 'session_link': 'https://example.com/join', 'access_type': 'free'}, 'title', 'session_link'),
            ('homepage-posts', {'title': 'admin-fixes-post', 'body_html': '<p>Review content</p>', 'status': 'draft'}, 'title', None),
        ]
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', headers=headers) as client:
                for domain, payload, title_field, url_field in cases:
                    with self.subTest(domain=domain):
                        response = await client.post(f'/admin/{domain}', json=payload)
                        self.assertEqual(response.status_code, 201, response.text)
                        row = response.json()
                        path = f'/admin/{domain}/{row["id"]}'
                        created.append(path)
                        self.assertTrue(row['updated_at'])
                        first = await client.patch(path, json={title_field: payload[title_field] + '-new', 'expected_updated_at': row['updated_at']})
                        self.assertEqual(first.status_code, 200, first.text)
                        stale = await client.patch(path, json={title_field: 'stale overwrite', 'expected_updated_at': row['updated_at']})
                        self.assertEqual(stale.status_code, 409, stale.text)
                        self.assertEqual(stale.json()['detail']['code'], 'stale_version')
                        rows = (await client.get(f'/admin/{domain}')).json()
                        saved = next(item for item in rows if item['id'] == row['id'])
                        self.assertEqual(saved[title_field], payload[title_field] + '-new')
                        statements = []
                        def capture(_connection, _cursor, statement, _parameters, _context, _many):
                            statements.append(statement)
                        database = AsyncSessionLocal.kw['bind']
                        event.listen(database.sync_engine, 'before_cursor_execute', capture)
                        try:
                            paged = await client.get(f'/admin/{domain}?paginated=true&limit=1&offset=0')
                        finally:
                            event.remove(database.sync_engine, 'before_cursor_execute', capture)
                        self.assertEqual(paged.status_code, 200, paged.text)
                        self.assertEqual(len(paged.json()['items']), 1)
                        self.assertGreaterEqual(paged.json()['total'], 1)
                        table = domain.replace('-', '_')
                        data_queries = [sql for sql in statements if f'FROM {table}' in sql]
                        self.assertEqual(len(data_queries), 2, 'One count and one paginated data query')
                        print(f'admin-fixes {domain}: list queries=2 (count + data)')
                        if url_field:
                            invalid = await client.patch(path, json={url_field: 'not-a-url', 'expected_updated_at': first.json()['updated_at']})
                            self.assertEqual(invalid.status_code, 422, invalid.text)
                            self.assertTrue(all('input' not in item for item in invalid.json()['detail']))
                        async with AsyncSessionLocal() as db:
                            count = await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.actor_id == admin_id, AuditLog.entity_id == row['id']))
                        self.assertEqual(count, 2, 'Only the successful create and update are audited')
                course = await client.post('/admin/courses', json={'title': 'admin-fixes-duration', 'access_type': 'free'})
                self.assertEqual(course.status_code, 201, course.text)
                course_path = f'/admin/courses/{course.json()["id"]}'
                created.append(course_path)
                module = await client.post(f'{course_path}/modules', json={'title': 'admin-fixes-module', 'order': 0})
                self.assertEqual(module.status_code, 201, module.text)
                module_id = module.json()['id']
                lesson = await client.post(f'/admin/modules/{module_id}/lessons', json={'title': 'admin-fixes-lesson', 'body_html': '<p>Content</p>', 'order': 0})
                self.assertEqual(lesson.status_code, 201, lesson.text)
                lesson_path = f'/admin/modules/{module_id}/lessons/{lesson.json()["id"]}'
                optional_duration = await client.patch(lesson_path, json={'duration_minutes': 0})
                self.assertEqual(optional_duration.status_code, 200, optional_duration.text)
                self.assertEqual(optional_duration.json()['duration_minutes'], 0)
                negative_duration = await client.patch(lesson_path, json={'duration_minutes': -1})
                self.assertEqual(negative_duration.status_code, 422, negative_duration.text)
        finally:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', headers=headers) as client:
                for path in reversed(created):
                    response = await client.delete(path)
                    self.assertEqual(response.status_code, 204, response.text)
            async with AsyncSessionLocal() as db:
                await db.execute(delete(AuditLog).where(AuditLog.actor_id == admin_id))
                await db.execute(delete(User).where(User.id == admin_id))
                await db.commit()
            await AsyncSessionLocal.kw['bind'].dispose()
