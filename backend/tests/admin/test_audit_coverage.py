import asyncio
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from tests import configure_test_environment
configure_test_environment()
import httpx
from sqlalchemy import delete, event, select
from app.core.security import create_access_token
from app.core.storage import LocalStorageBackend
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AuditLog, Course, HomepagePost, Masterclass, Opportunity, Profile, Resource, ServiceRequest, ServiceStatus, ServiceType, User, UserRole
from tests.media.test_images import image_bytes

# Explicit raw stored actions, including existing upload/status_change aliases.
AUDIT_ACTIONS = {
    ('POST', '/admin/courses'): {'created'},
    ('PATCH', '/admin/courses/{course_id}'): {'updated', 'published', 'unpublished'},
    ('DELETE', '/admin/courses/{course_id}'): {'deleted'},
    ('POST', '/admin/courses/{course_id}/publish'): {'published'},
    ('POST', '/admin/courses/{course_id}/unpublish'): {'unpublished'},
    ('POST', '/admin/courses/{course_id}/duplicate'): {'created'},
    ('POST', '/admin/courses/{course_id}/structure/reorder'): {'reordered'},
    ('POST', '/admin/resources'): {'created'},
    ('POST', '/admin/opportunities'): {'created'},
    ('POST', '/admin/masterclasses'): {'created'},
    ('POST', '/admin/courses/{course_id}/modules'): {'created'},
    ('PATCH', '/admin/courses/{course_id}/modules/{module_id}'): {'updated'},
    ('DELETE', '/admin/courses/{course_id}/modules/{module_id}'): {'deleted'},
    ('POST', '/admin/modules/{module_id}/lessons'): {'created'},
    ('PATCH', '/admin/modules/{module_id}/lessons/{lesson_id}'): {'updated'},
    ('DELETE', '/admin/modules/{module_id}/lessons/{lesson_id}'): {'deleted'},
    ('POST', '/admin/lessons/{lesson_id}/versions/{version_id}/restore'): {'updated'},
    ('POST', '/admin/lessons/{lesson_id}/duplicate'): {'created'},
    ('PATCH', '/admin/resources/{resource_id}'): {'update', 'status_change'},
    ('DELETE', '/admin/resources/{resource_id}'): {'deleted'},
    ('PATCH', '/admin/opportunities/{opportunity_id}'): {'updated'},
    ('DELETE', '/admin/opportunities/{opportunity_id}'): {'deleted'},
    ('PATCH', '/admin/masterclasses/{masterclass_id}'): {'update', 'status_change'},
    ('DELETE', '/admin/masterclasses/{masterclass_id}'): {'deleted'},
    ('PATCH', '/admin/service-requests/{request_id}/status'): {'status_change'},
    ('POST', '/admin/homepage-posts'): {'created'},
    ('PATCH', '/admin/homepage-posts/{post_id}'): {'updated', 'published', 'unpublished', 'pinned', 'unpinned'},
    ('DELETE', '/admin/homepage-posts/{post_id}'): {'deleted'},
    ('POST', '/admin/homepage-posts/reorder'): {'reordered'},
    ('POST', '/admin/media'): {'upload'},
}
EXEMPTIONS = {}  # No mutation currently qualifies for an exemption.


class AuditCoverageTests(unittest.TestCase):
    def test_openapi_registry_complete_and_audit_read_only(self):
        actual = {(method.upper(), path) for path, item in app.openapi()['paths'].items() if path.startswith('/admin/') for method in item if method != 'get'}
        self.assertEqual(actual, set(AUDIT_ACTIONS) | set(EXEMPTIONS))
        self.assertFalse(set(AUDIT_ACTIONS) & set(EXEMPTIONS))
        self.assertTrue(all(EXEMPTIONS.values()))
        self.assertFalse(any(path.startswith('/admin/audit-logs') for _, path in actual))
        print('AUDIT_COVERAGE_OPERATIONS', len(actual), 'exemptions', len(EXEMPTIONS), 'audit_log_mutation_routes=0')

    def test_every_successful_admin_mutation_writes_exactly_one_actual_row(self):
        admin_id, student_id, request_id = uuid4(), uuid4(), uuid4()
        prefix = 'cfp-audit-' + str(uuid4())
        ids, seen = {'request_id': str(request_id)}, set()
        directory = tempfile.TemporaryDirectory(prefix='cfp-audit-media-')
        storage = LocalStorageBackend(Path(directory.name))
        async def run():
            seed_pins = []
            try:
                async with AsyncSessionLocal() as db:
                    for identifier, role in [(admin_id, UserRole.admin), (student_id, UserRole.student)]:
                        user = User(id=identifier, email=f'{prefix}-{identifier}@example.com', role=role, hashed_password='unused')
                        user.profile = Profile(full_name=prefix)
                        db.add(user)
                    await db.flush()
                    db.add(ServiceRequest(id=request_id, user_id=student_id, service_type=ServiceType.essay_review, status=ServiceStatus.submitted))
                    seed_pins = [(row.id, row.pin_order) for row in (await db.scalars(select(HomepagePost).where(HomepagePost.pinned.is_(True)).order_by(HomepagePost.pin_order))).all()]
                    await db.commit()
                headers = {'Authorization': 'Bearer ' + create_access_token(str(admin_id))}
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    async def rows():
                        async with AsyncSessionLocal() as db:
                            return list((await db.scalars(select(AuditLog).where(AuditLog.actor_id == admin_id))).all())

                    async def call(method, template, payload=None, **kwargs):
                        before = {row.id for row in await rows()}
                        queries = []
                        def capture(*args):
                            queries.append(1)
                        engine = AsyncSessionLocal.kw['bind'].sync_engine
                        event.listen(engine, 'before_cursor_execute', capture)
                        try:
                            response = await client.request(method, template.format_map(ids), headers=headers, **({'json': payload} if payload is not None else {}), **kwargs)
                        finally:
                            event.remove(engine, 'before_cursor_execute', capture)
                        self.assertIn(response.status_code, {200, 201, 204}, method + ' ' + template + ' status=' + str(response.status_code))
                        added = [row for row in await rows() if row.id not in before]
                        self.assertEqual(len(added), 1, method + ' ' + template)
                        self.assertIn(added[0].action, AUDIT_ACTIONS[(method, template)])
                        self.assertTrue(added[0].extra_data.get('label'))
                        self.assertIsInstance(added[0].extra_data.get('affected_ids'), list)
                        self.assertTrue(added[0].extra_data.get('changes'))
                        if template.endswith(('/reorder', '/duplicate')):
                            print('AUDIT_MUTATION_SQL_QUERY_COUNT', method, template, len(queries))
                        seen.add((method, template))
                        return response.json() if response.status_code != 204 else None

                    course = await call('POST', '/admin/courses', {'title': prefix, 'summary': prefix, 'access_type': 'free'})
                    ids['course_id'] = course['id']
                    unit = await call('POST', '/admin/courses/{course_id}/modules', {'title': prefix, 'order': 1})
                    ids['module_id'] = unit['id']
                    lesson = await call('POST', '/admin/modules/{module_id}/lessons', {'title': prefix, 'body_html': '<p>CFP audit</p>', 'duration_minutes': 1, 'order': 1})
                    ids['lesson_id'] = lesson['id']
                    await call('PATCH', '/admin/courses/{course_id}', {'summary': prefix + ' updated'})
                    await call('PATCH', '/admin/courses/{course_id}/modules/{module_id}', {'title': prefix + ' updated'})
                    lesson = await call('PATCH', '/admin/modules/{module_id}/lessons/{lesson_id}', {'title': prefix + ' updated'})
                    await call('PATCH', '/admin/modules/{module_id}/lessons/{lesson_id}', {'title': prefix + ' updated'})  # no-op also audited
                    history = (await client.get('/admin/lessons/' + ids['lesson_id'] + '/versions', headers=headers)).json()
                    ids['version_id'] = history['items'][0]['id']
                    await call('POST', '/admin/lessons/{lesson_id}/versions/{version_id}/restore', {'expected_updated_at': lesson['updated_at']})
                    await call('POST', '/admin/courses/{course_id}/publish')
                    await call('POST', '/admin/courses/{course_id}/publish')  # idempotent action also audited
                    await call('POST', '/admin/courses/{course_id}/unpublish')
                    detail = (await client.get('/admin/courses/' + ids['course_id'], headers=headers)).json()
                    await call('POST', '/admin/courses/{course_id}/structure/reorder', {'structure_revision': detail['structure_revision'], 'modules': [{'id': ids['module_id'], 'lessons': [{'id': ids['lesson_id']}]}]})
                    copy = await call('POST', '/admin/courses/{course_id}/duplicate', {'title': prefix + ' copy'})
                    original_course = ids['course_id']; ids['course_id'] = copy['id']
                    await call('DELETE', '/admin/courses/{course_id}')
                    ids['course_id'] = original_course
                    copy = await call('POST', '/admin/lessons/{lesson_id}/duplicate')
                    original_lesson = ids['lesson_id']; ids['lesson_id'] = copy['id']
                    await call('DELETE', '/admin/modules/{module_id}/lessons/{lesson_id}')
                    ids['lesson_id'] = original_lesson
                    await call('DELETE', '/admin/modules/{module_id}/lessons/{lesson_id}')
                    await call('DELETE', '/admin/courses/{course_id}/modules/{module_id}')
                    await call('DELETE', '/admin/courses/{course_id}')
                    for plural, field, title_field, payload in [
                        ('resources', 'resource_id', 'title', {'category': 'CFP', 'access_type': 'free', 'status': 'draft'}),
                        ('opportunities', 'opportunity_id', 'name', {'category': 'CFP'}),
                        ('masterclasses', 'masterclass_id', 'title', {'speaker_name': prefix, 'session_datetime': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), 'session_link': 'https://example.com/cfp', 'access_type': 'free'}),
                        ('homepage-posts', 'post_id', 'title', {'body_html': '<p>CFP audit</p>', 'status': 'draft'}),
                    ]:
                        item = await call('POST', '/admin/' + plural, {title_field: prefix, **payload})
                        ids[field] = item['id']
                        await call('PATCH', '/admin/' + plural + '/{' + field + '}', {title_field: prefix + ' updated'})
                        await call('DELETE', '/admin/' + plural + '/{' + field + '}')
                    await call('POST', '/admin/homepage-posts/reorder', {'ordered_ids': [str(identifier) for identifier, _ in seed_pins]})
                    await call('PATCH', '/admin/service-requests/{request_id}/status', {'status': 'in_progress'})
                    with patch('app.routers.media.storage_backend', storage):
                        await call('POST', '/admin/media', files={'file': ('cfp-audit.png', image_bytes((200, 200), 'PNG'), 'image/png')})
                    self.assertEqual(seen, set(AUDIT_ACTIONS))
                    print('AUDIT_RUNTIME_OPERATIONS', len(seen), 'successful_calls', len(await rows()), 'one_row_per_call=true')
            finally:
                async with AsyncSessionLocal() as db:
                    restored = 0
                    for identifier, order in seed_pins:
                        row = await db.get(HomepagePost, identifier)
                        if row.pin_order != order:
                            row.pin_order = order; restored += 1
                    counts = {}
                    for model, criterion in [(AuditLog, AuditLog.actor_id == admin_id), (ServiceRequest, ServiceRequest.id == request_id), (Course, Course.title.like(prefix + '%')), (Resource, Resource.title.like(prefix + '%')), (Opportunity, Opportunity.name.like(prefix + '%')), (Masterclass, Masterclass.title.like(prefix + '%')), (HomepagePost, HomepagePost.title.like(prefix + '%')), (User, User.id.in_([admin_id, student_id]))]:
                        counts[model.__tablename__] = (await db.execute(delete(model).where(criterion))).rowcount
                    await db.commit()
                    print('CFP_AUDIT_ROWS_REMOVED', counts, 'seed_pin_orders_restored', restored)
                await AsyncSessionLocal.kw['bind'].dispose()
        try:
            asyncio.run(run())
        finally:
            directory.cleanup()
