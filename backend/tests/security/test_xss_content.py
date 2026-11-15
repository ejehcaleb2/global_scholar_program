import asyncio
import re
import unittest
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from uuid import uuid4

from tests import configure_test_environment, credential
configure_test_environment()

import httpx
from sqlalchemy import delete, event, update
from app.core.content import sanitize_html, sanitize_lesson_html
from app.core.security import create_access_token, get_password_hash
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AccessType, AuditLog, Course, CourseStatus, HomepagePost, HomepageStatus, Lesson, Module, Opportunity, Profile, Resource, ResourceStatus, User, UserRole
from tests.security.xss_corpus import XSS_CORPUS


class DangerousConstructParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.dangerous = []

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style', 'iframe', 'svg', 'math', 'base', 'meta', 'object', 'embed', 'form', 'input', 'video', 'audio', 'template'}:
            self.dangerous.append(tag)
        for name, value in attrs:
            normalized = re.sub(r'[\x00-\x20]', '', unescape(value or '')).lower()
            if name.startswith('on') or name in {'srcdoc', 'style'} or (name in {'href', 'src', 'xlink:href'} and normalized.startswith(('javascript:', 'data:', 'vbscript:'))):
                self.dangerous.append(name)

    handle_startendtag = handle_starttag


def assert_safe(test, html):
    parser = DangerousConstructParser()
    parser.feed(html)
    test.assertEqual(parser.dangerous, [])


class XssContentIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls):
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self):
        self.admin, self.student, self.course, self.module, self.lesson, self.post, self.resource, self.opportunity = [uuid4() for _ in range(8)]
        self.prefix = f'cfp-xss-{self.course}'
        async def create():
            async with AsyncSessionLocal() as db:
                for user_id in [self.admin, self.student]:
                    user = User(id=user_id, email=f'cfp-xss-{user_id}@example.com', role=UserRole.admin if user_id == self.admin else UserRole.student, hashed_password=get_password_hash(credential()))
                    user.profile = Profile(full_name='CFP XSS Student')
                    db.add(user)
                await db.flush()
                course = Course(id=self.course, title=self.prefix, summary='CFP summary', description='CFP description', access_type=AccessType.free, status=CourseStatus.published)
                module = Module(id=self.module, title=self.prefix, order=0)
                module.lessons = [Lesson(id=self.lesson, title=self.prefix, body_html='<p>CFP lesson</p>', duration_minutes=1, order=0)]
                course.modules = [module]
                db.add_all([course, HomepagePost(id=self.post, title=self.prefix, body_html='<p>CFP post</p>', status=HomepageStatus.published, published_at=datetime.now(timezone.utc)), Resource(id=self.resource, title=self.prefix, description='CFP resource', category='CFP XSS', access_type=AccessType.free, status=ResourceStatus.published), Opportunity(id=self.opportunity, name=self.prefix, description='CFP opportunity', category='CFP XSS', created_by=self.admin, deadline=datetime.now(timezone.utc) + timedelta(minutes=5))])
                await db.commit()
        self.loop.run_until_complete(create())

    def tearDown(self):
        async def remove():
            async with AsyncSessionLocal() as db:
                counts = {}
                for model, predicate in [(AuditLog, AuditLog.actor_id == self.admin), (HomepagePost, HomepagePost.id == self.post), (Resource, Resource.id == self.resource), (Opportunity, Opportunity.id == self.opportunity), (Course, Course.id == self.course), (User, User.id.in_([self.admin, self.student]))]:
                    counts[model.__tablename__] = (await db.execute(delete(model).where(predicate))).rowcount
                await db.commit()
                print('CFP_XSS_ROWS_REMOVED', counts)
        self.loop.run_until_complete(remove())

    def headers(self, user_id=None):
        return {'Authorization': 'Bearer ' + create_access_token(str(user_id or self.admin))}

    def run_client(self, callback):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                await callback(client)
        self.loop.run_until_complete(run())

    def test_corpus_write_stored_and_read_safety_for_all_six_fields(self):
        self.assertGreaterEqual(len(XSS_CORPUS), 30)
        async def run(client):
            for index, payload in enumerate(XSS_CORPUS):
                with self.subTest(payload=index):
                    self.assertLessEqual(len(sanitize_html(payload)), 200)
                    writes = [(f'/admin/homepage-posts/{self.post}', {'body_html': payload}), (f'/admin/courses/{self.course}', {'summary': payload, 'description': payload}), (f'/admin/modules/{self.module}/lessons/{self.lesson}', {'body_html': payload}), (f'/admin/resources/{self.resource}', {'description': payload}), (f'/admin/opportunities/{self.opportunity}', {'description': payload})]
                    for path, body in writes:
                        response = await client.patch(path, headers=self.headers(), json=body)
                        self.assertEqual(response.status_code, 200, f'case={index} path={path} status={response.status_code}')
                    async with AsyncSessionLocal() as db:
                        stored = [(await db.get(HomepagePost, self.post)).body_html, (await db.get(Lesson, self.lesson)).body_html, (await db.get(Course, self.course)).summary, (await db.get(Course, self.course)).description, (await db.get(Resource, self.resource)).description, (await db.get(Opportunity, self.opportunity)).description]
                    course = (await client.get(f'/admin/courses/{self.course}', headers=self.headers())).json()
                    post = (await client.get(f'/admin/homepage-posts/{self.post}', headers=self.headers())).json()
                    resources = (await client.get('/admin/resources', headers=self.headers())).json()
                    opportunities = (await client.get('/admin/opportunities', headers=self.headers())).json()
                    returned = [post['body_html'], course['modules'][0]['lessons'][0]['body_html'], course['summary'], course['description'], next(row['description'] for row in resources if row['id'] == str(self.resource)), next(row['description'] for row in opportunities if row['id'] == str(self.opportunity))]
                    for field_index, (saved, read) in enumerate(zip(stored, returned)):
                        sanitizer = (lambda value: sanitize_lesson_html(value, validate_images=False)) if field_index == 1 else sanitize_html
                        assert_safe(self, saved)
                        assert_safe(self, read)
                        self.assertEqual(saved, read)
                        self.assertEqual(saved, sanitizer(saved))
            print('XSS_WRITE_READ_CASES', len(XSS_CORPUS), 'FIELDS_PER_CASE', 6, 'TOTAL_FIELD_CASES', len(XSS_CORPUS) * 6)
        self.run_client(run)

    def test_legacy_unsanitized_rows_are_sanitized_on_return(self):
        payload = '<p onclick="window.__cfpXss=1">CFP</p><script>window.__cfpXss=1</script>'
        async def run(client):
            async with AsyncSessionLocal() as db:
                await db.execute(update(Course).where(Course.id == self.course).values(description=payload, summary=payload))
                await db.execute(update(Lesson).where(Lesson.id == self.lesson).values(body_html=payload))
                await db.execute(update(Resource).where(Resource.id == self.resource).values(description=payload))
                await db.execute(update(Opportunity).where(Opportunity.id == self.opportunity).values(description=payload))
                await db.execute(update(HomepagePost).where(HomepagePost.id == self.post).values(body_html=payload))
                await db.commit()
            for path, headers in [(f'/admin/courses/{self.course}', self.headers()), (f'/courses/{self.course}', self.headers(self.student))]:
                response = await client.get(path, headers=headers)
                self.assertEqual(response.status_code, 200)
                value = response.json()
                for html in [value['summary'], value['description'], value['modules'][0]['lessons'][0]['body_html']]:
                    assert_safe(self, html)
            for path, key, target in [('/admin/resources', 'description', self.resource), ('/admin/opportunities', 'description', self.opportunity)]:
                value = (await client.get(path, headers=self.headers())).json()
                assert_safe(self, next(row[key] for row in value if row['id'] == str(target)))
            post = (await client.get(f'/homepage-posts/{self.post}')).json()
            assert_safe(self, post['body_html'])
        self.run_client(run)

    def test_changed_list_and_nested_endpoint_query_counts(self):
        async def run(client):
            queries = []
            def count(_connection, _cursor, statement, _parameters, _context, _many):
                if statement.lstrip().upper().startswith('SELECT'):
                    queries.append(statement)
            engine = AsyncSessionLocal.kw['bind'].sync_engine
            event.listen(engine, 'before_cursor_execute', count)
            try:
                for path in ['/admin/courses', f'/admin/courses/{self.course}', '/admin/resources', '/admin/opportunities', '/courses', f'/courses/{self.course}', '/resources', '/opportunities']:
                    queries.clear()
                    response = await client.get(path, headers=self.headers())
                    self.assertEqual(response.status_code, 200)
                    self.assertLessEqual(len(queries), 12)
                    print('XSS_ENDPOINT_SQL_QUERY_COUNT', path.replace(str(self.course), '{course_id}'), len(queries))
            finally:
                event.remove(engine, 'before_cursor_execute', count)
        self.run_client(run)
