import asyncio
import io
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from tests import configure_test_environment, credential
configure_test_environment()

import httpx
from PIL import Image
from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core import rate_limit
from app.core.config import get_settings
from app.core.images import thumbnail_key
from app.core.security import create_access_token, get_password_hash
from app.core.storage import LocalStorageBackend, sniff_content_type
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import AuditLog, Profile, ServiceRequest, Subscription, SubscriptionPlan, SubscriptionStatus, User, UserRole
from tests.media.test_images import image_bytes


class ImageAccessIntegrationTests(unittest.TestCase):
    def test_cross_student_ownership_for_every_student_id_surface(self):
        from app.models.gsp_models import AccessType, Course, CourseStatus, Lesson, Module
        course_id, module_id, lesson_id = uuid4(), uuid4(), uuid4()
        async def run(client):
            async with AsyncSessionLocal() as db:
                course = Course(id=course_id, title='CFP ownership', access_type=AccessType.free, status=CourseStatus.published)
                unit = Module(id=module_id, title='CFP ownership', order=0)
                unit.lessons = [Lesson(id=lesson_id, title='CFP ownership', body_html='<p>CFP ownership</p>', order=0)]
                course.modules = [unit]
                db.add(course)
                await db.commit()
            try:
                self.assertEqual((await self.upload_avatar(client)).status_code, 200)
                self.assertEqual((await client.get(f'/profile/avatar/{self.owner}', headers=self.headers(self.other))).status_code, 404)
                created = await client.post('/service-requests', headers=self.headers(self.owner), data={'service_type': 'essay_review'}, files={'file': ('cfp-ownership.pdf', b'%PDF-1.7\nCFP\n%%EOF\n', 'application/pdf')})
                self.assertEqual(created.status_code, 201)
                request_id = created.json()['id']
                self.assertEqual((await client.get(f'/service-requests/{request_id}/document', headers=self.headers(self.other))).status_code, 403)
                listed = await client.get('/service-requests', headers=self.headers(self.other))
                self.assertEqual(listed.status_code, 200)
                self.assertNotIn(request_id, [row['id'] for row in listed.json()])
                profile = await client.get('/profile', headers=self.headers(self.other), params={'user_id': str(self.owner)})
                self.assertEqual(profile.json()['user_id'], str(self.other))
                self.assertEqual((await client.get(f'/admin/students/{self.owner}', headers=self.headers(self.other))).status_code, 403)
                self.assertEqual((await client.post(f'/lessons/{lesson_id}/complete', headers=self.headers(self.owner))).status_code, 200)
                self.assertEqual((await client.delete(f'/lessons/{lesson_id}/complete', headers=self.headers(self.other))).status_code, 200)
                owner = (await client.get(f'/courses/{course_id}', headers=self.headers(self.owner))).json()
                other = (await client.get(f'/courses/{course_id}', headers=self.headers(self.other))).json()
                self.assertTrue(owner['modules'][0]['lessons'][0]['completed'])
                self.assertFalse(other['modules'][0]['lessons'][0]['completed'])
                print('OWNERSHIP avatar=404 document=403 admin-student=403 list=own-only profile=own-only progress=own-only')
            finally:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(delete(Course).where(Course.id == course_id))
                    await db.commit()
                    print('CFP_OWNERSHIP_COURSES_REMOVED', result.rowcount)
        self.run_client(run)

    @classmethod
    def setUpClass(cls):
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)

    @classmethod
    def tearDownClass(cls):
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self):
        self.owner, self.other, self.admin, self.inactive = [uuid4() for _ in range(4)]
        self.directory = tempfile.TemporaryDirectory(prefix='cfp-images-')
        self.storage = LocalStorageBackend(Path(self.directory.name))
        for module in ['profile', 'media', 'service_requests']:
            current = patch(f'app.routers.{module}.storage_backend', self.storage)
            current.start()
            self.addCleanup(current.stop)
        current = patch.object(rate_limit, 'store', rate_limit.SlidingWindowStore())
        current.start()
        self.addCleanup(current.stop)
        async def create():
            async with AsyncSessionLocal() as db:
                for user_id in [self.owner, self.other, self.admin, self.inactive]:
                    user = User(id=user_id, email=f'cfp-images-{user_id}@example.com', hashed_password=get_password_hash(credential()), role=UserRole.admin if user_id == self.admin else UserRole.student, is_active=user_id != self.inactive)
                    user.profile = Profile(full_name='CFP Image Student')
                    db.add(user)
                await db.flush()
                db.add(Subscription(user_id=self.owner, plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=datetime.now(timezone.utc) + timedelta(days=1)))
                await db.commit()
        self.loop.run_until_complete(create())

    def tearDown(self):
        async def remove():
            async with AsyncSessionLocal() as db:
                ids = [self.owner, self.other, self.admin, self.inactive]
                audits = await db.execute(delete(AuditLog).where(AuditLog.actor_id.in_(ids)))
                requests = await db.execute(delete(ServiceRequest).where(ServiceRequest.user_id.in_(ids)))
                result = await db.execute(delete(User).where(User.id.in_([self.owner, self.other, self.admin, self.inactive])))
                await db.commit()
                print('CFP_IMAGE_ROWS_REMOVED', 'audits', audits.rowcount, 'requests', requests.rowcount, 'users', result.rowcount)
        self.loop.run_until_complete(remove())
        self.directory.cleanup()

    def headers(self, user_id):
        return {'Authorization': 'Bearer ' + create_access_token(str(user_id))}

    def run_client(self, callback):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as client:
                await callback(client)
        self.loop.run_until_complete(run())

    async def upload_avatar(self, client, content=None):
        return await client.post('/profile/avatar', headers=self.headers(self.owner), files={'file': ('cfp-avatar.jpg', content or image_bytes(metadata=True), 'application/octet-stream')})

    def assert_clean(self, content):
        with Image.open(io.BytesIO(content)) as image:
            self.assertEqual(dict(image.getexif()), {})
            self.assertFalse(set(image.info) & {'exif', 'xmp', 'photoshop', 'comment', 'icc_profile'})

    def test_avatar_access_headers_and_both_variants(self):
        async def run(client):
            uploaded = await self.upload_avatar(client)
            self.assertEqual(uploaded.status_code, 200)
            self.assertIn('updated_at', uploaded.json())
            for size in [96, 512]:
                response = await client.get(f'/profile/avatar/{self.owner}?size={size}', headers=self.headers(self.owner))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers['content-type'], 'image/webp')
                self.assertEqual(response.headers['cache-control'], 'private, max-age=300')
                self.assertEqual(response.headers['vary'], 'Authorization')
                self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
                self.assert_clean(response.content)
            for user_id, expected in [(self.admin, 200), (self.other, 404), (self.inactive, 401)]:
                self.assertEqual((await client.get(f'/profile/avatar/{self.owner}', headers=self.headers(user_id))).status_code, expected)
            self.assertEqual((await client.get(f'/profile/avatar/{self.owner}')).status_code, 401)
        self.run_client(run)

    def test_replacement_removes_old_files_after_commit(self):
        async def run(client):
            first = (await self.upload_avatar(client)).json()['avatar_url']
            second = (await self.upload_avatar(client, image_bytes((800, 800), 'PNG'))).json()['avatar_url']
            self.assertNotEqual(first, second)
            self.assertFalse((self.storage.root / first).exists())
            self.assertFalse((self.storage.root / thumbnail_key(first)).exists())
            self.assertTrue((self.storage.root / second).is_file())
            self.assertTrue((self.storage.root / thumbnail_key(second)).is_file())
            async with AsyncSessionLocal() as db:
                self.assertEqual((await db.get(Profile, self.owner)).avatar_url, second)
        self.run_client(run)

    def test_failed_commit_and_partial_storage_write_leave_no_orphans(self):
        async def run(client):
            with patch.object(AsyncSession, 'commit', new=AsyncMock(side_effect=RuntimeError('CFP commit failure'))):
                self.assertEqual((await self.upload_avatar(client)).status_code, 500)
            self.assertEqual(list(self.storage.root.rglob('*')), [])
            original = self.storage.save_bytes
            calls = 0
            async def fail_second(key, content):
                nonlocal calls
                calls += 1
                await original(key, content)
                if calls == 2:
                    raise OSError('CFP partial write failure')
            with patch.object(self.storage, 'save_bytes', side_effect=fail_second):
                self.assertEqual((await self.upload_avatar(client)).status_code, 500)
            self.assertEqual(list(self.storage.root.rglob('*')), [])
            async with AsyncSessionLocal() as db:
                self.assertIsNone((await db.get(Profile, self.owner)).avatar_url)
        self.run_client(run)

    def test_admin_public_media_is_reencoded_and_authorized(self):
        async def run(client):
            payload = {'file': ('renamed.html', image_bytes(metadata=True), 'text/html')}
            self.assertEqual((await client.post('/admin/media', files=payload)).status_code, 401)
            self.assertEqual((await client.post('/admin/media', headers=self.headers(self.other), files=payload)).status_code, 403)
            uploaded = await client.post('/admin/media', headers=self.headers(self.admin), files=payload)
            self.assertEqual(uploaded.status_code, 201)
            filename = uploaded.json()['url'].rsplit('/', 1)[1]
            self.assertRegex(filename, r'^[0-9a-f-]{36}\.jpg$')
            response = await client.get('/media/public/' + filename)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['content-type'], 'image/jpeg')
            self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
            self.assertEqual(response.headers['referrer-policy'], 'no-referrer')
            self.assertEqual(response.headers['x-frame-options'], 'DENY')
            self.assert_clean(response.content)
        self.run_client(run)

    def test_document_names_are_neutral_and_headers_are_sniffed(self):
        async def run(client):
            for name in ['../../cfp-original.pdf', 'cfp\r\nX-Injected: value.pdf', 'x' * 400 + '.pdf', 'cfp.exe.pdf']:
                created = await client.post('/service-requests', headers=self.headers(self.owner), data={'service_type': 'essay_review'}, files={'file': (name, b'%PDF-1.7\nCFP document\n%%EOF\n', 'text/html')})
                self.assertEqual(created.status_code, 201)
                request = created.json()
                async with AsyncSessionLocal() as db:
                    storage_key = await db.scalar(select(ServiceRequest.document_url).where(ServiceRequest.id == UUID(request['id'])))
                self.assertRegex(storage_key, r'^[0-9a-f-]{36}\.pdf$')
                response = await client.get(f"/service-requests/{request['id']}/document", headers=self.headers(self.owner))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers['content-disposition'], f"attachment; filename=\"essay_review-{request['id'][:8]}.pdf\"")
                self.assertEqual(response.headers['content-type'], 'application/pdf')
                self.assertEqual(response.headers['cache-control'], 'private, no-store')
                self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
                self.assertNotIn(name, str(response.headers))
                for user_id, expected in [(self.admin, 200), (self.other, 403), (self.inactive, 401)]:
                    self.assertEqual((await client.get(f"/service-requests/{request['id']}/document", headers=self.headers(user_id))).status_code, expected)
                self.assertEqual((await client.get(f"/service-requests/{request['id']}/document")).status_code, 401)
        self.run_client(run)

    def test_private_image_documents_also_drop_metadata(self):
        async def run(client):
            created = await client.post('/service-requests', headers=self.headers(self.owner), data={'service_type': 'essay_review'}, files={'file': ('cfp-scan.jpg', image_bytes(metadata=True), 'image/jpeg')})
            self.assertEqual(created.status_code, 201)
            response = await client.get(f"/service-requests/{created.json()['id']}/document", headers=self.headers(self.owner))
            self.assertEqual(response.headers['content-type'], 'image/jpeg')
            self.assert_clean(response.content)
        self.run_client(run)

    def test_all_three_upload_endpoints_have_user_scoped_limits(self):
        settings = get_settings().model_copy(update={'RATE_AVATAR_UPLOAD': 1, 'RATE_ADMIN_UPLOAD': 1, 'RATE_SERVICE_UPLOAD': 1})
        async def run(client):
            with patch.object(rate_limit, 'get_settings', return_value=settings):
                for _ in range(2):
                    avatar = await self.upload_avatar(client)
                    media = await client.post('/admin/media', headers=self.headers(self.admin), files={'file': ('cfp.jpg', image_bytes(), 'image/jpeg')})
                    document = await client.post('/service-requests', headers=self.headers(self.owner), data={'service_type': 'essay_review'}, files={'file': ('cfp.pdf', b'%PDF-1.7\n%%EOF\n', 'application/pdf')})
                    if _ == 0:
                        self.assertEqual([avatar.status_code, media.status_code, document.status_code], [200, 201, 201])
                    else:
                        for response in [avatar, media, document]:
                            self.assertEqual(response.status_code, 429)
                            self.assertEqual(response.json()['detail']['code'], 'rate_limited')
                            self.assertGreater(int(response.headers['Retry-After']), 0)
        self.run_client(run)

    def test_changed_admin_lists_have_bounded_query_counts(self):
        async def run(client):
            await client.post('/admin/media', headers=self.headers(self.admin), files={'file': ('cfp.jpg', image_bytes(), 'image/jpeg')})
            queries = []
            def count(_connection, _cursor, statement, _parameters, _context, _many):
                if statement.lstrip().upper().startswith('SELECT'):
                    queries.append(statement)
            engine = AsyncSessionLocal.kw['bind'].sync_engine
            event.listen(engine, 'before_cursor_execute', count)
            try:
                for path, expected in [('/admin/students', 2), ('/admin/audit-logs', 3)]:
                    queries.clear()
                    response = await client.get(path, headers=self.headers(self.admin))
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(len(queries), expected)
                    print('IMAGE_ADMIN_LIST_SQL_QUERY_COUNT', path, len(queries))
            finally:
                event.remove(engine, 'before_cursor_execute', count)
        self.run_client(run)


class ExistingImageMetadataTests(unittest.TestCase):
    def test_public_assets_and_every_development_upload_have_no_exif_or_gps(self):
        root = Path(__file__).resolve().parents[3]
        counts = {}
        for label, directory in [('app_public', root / 'app/public'), ('development_uploads', root / 'backend/uploads')]:
            counts[label] = 0
            for path in directory.rglob('*'):
                if not path.is_file():
                    continue
                content = path.read_bytes()
                if sniff_content_type(content) not in {'image/jpeg', 'image/png', 'image/webp'}:
                    continue
                counts[label] += 1
                with Image.open(io.BytesIO(content)) as image:
                    self.assertEqual(dict(image.getexif()), {}, str(path.relative_to(root)))
                    self.assertFalse(set(image.info) & {'exif', 'xmp', 'photoshop', 'comment', 'icc_profile'}, str(path.relative_to(root)))
        print('EXISTING_IMAGE_METADATA_SCAN', counts, 'metadata=0')
