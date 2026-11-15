from tests import configure_test_environment

configure_test_environment()

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest import TestCase

import httpx
from sqlalchemy import case, delete, distinct, event, func, select

from app.core.config import get_settings
from app.core.content import parse_lesson_video_url, sanitize_lesson_html
from app.core.security import create_access_token
from app.core.progress import persist_course_progress
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import (
    AccessType,
    AuditLog,
    Course,
    CourseProgress,
    CourseStatus,
    Lesson,
    LessonProgress,
    LessonVersion,
    Module,
    Opportunity,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    User,
    UserRole,
)


class ContentAccessTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = cls.loop.run_until_complete(
            cls._create_client()
        )
        cls.loop.run_until_complete(cls._create_fixtures())

    @classmethod
    async def _create_client(cls) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')

    @classmethod
    async def _create_fixtures(cls) -> None:
        cls.admin_id = uuid.uuid4()
        cls.paid_id = uuid.uuid4()
        cls.free_id = uuid.uuid4()
        cls.course_id = uuid.uuid4()
        cls.module_id = uuid.uuid4()
        cls.lesson_id = uuid.uuid4()
        cls.opportunity_ids = [uuid.uuid4() for _ in range(5)]

        async with AsyncSessionLocal() as session:
            admin = User(id=cls.admin_id, email=f'{cls.admin_id}@example.com', hashed_password='unused', role=UserRole.admin)
            paid = User(id=cls.paid_id, email=f'{cls.paid_id}@example.com', hashed_password='unused', role=UserRole.student)
            free = User(id=cls.free_id, email=f'{cls.free_id}@example.com', hashed_password='unused', role=UserRole.student)
            paid.subscriptions = [
                Subscription(
                    user_id=cls.paid_id,
                    plan=SubscriptionPlan.monthly,
                    status=SubscriptionStatus.active,
                    current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
                )
            ]
            course = Course(
                id=cls.course_id,
                title='Members Course',
                summary='A course for access-control tests',
                description='Course description',
                access_type=AccessType.members_only,
                status=CourseStatus.published,
            )
            module = Module(id=cls.module_id, title='Module One', order=1)
            lesson = Lesson(
                id=cls.lesson_id,
                title='Lesson One',
                body_html='<p>Lesson body</p>',
                try_it_yourself_prompt='Reflect',
                order=1,
            )
            module.lessons = [lesson]
            course.modules = [module]
            opportunities = [
                Opportunity(
                    id=opportunity_id,
                    name=f'Opportunity {index}',
                    category='scholarship',
                    deadline=datetime.now(timezone.utc) + timedelta(days=index + 10),
                    created_by=cls.admin_id,
                )
                for index, opportunity_id in enumerate(cls.opportunity_ids)
            ]
            session.add_all([admin, paid, free])
            await session.flush()
            session.add_all([course, *opportunities])
            await session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(cls._cleanup())
        cls.loop.run_until_complete(cls.client.aclose())
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    @classmethod
    async def _cleanup(cls) -> None:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AuditLog).where(AuditLog.actor_id == cls.admin_id))
            await session.execute(delete(Opportunity).where(Opportunity.id.in_(cls.opportunity_ids)))
            await session.execute(delete(Course).where(Course.id == cls.course_id))
            await session.execute(delete(User).where(User.id.in_([cls.admin_id, cls.paid_id, cls.free_id])))
            await session.commit()

    def bearer(self, user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def test_paid_student_can_get_members_only_course(self) -> None:
        response = self.loop.run_until_complete(
            self.client.get(f'/courses/{self.course_id}', headers=self.bearer(self.paid_id))
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['modules'][0]['lessons'][0]['title'], 'Lesson One')

    def test_free_student_is_denied_members_only_course(self) -> None:
        response = self.loop.run_until_complete(
            self.client.get(f'/courses/{self.course_id}', headers=self.bearer(self.free_id))
        )
        self.assertEqual(response.status_code, 403)

    def test_lesson_video_url_parser_accepts_only_supported_https_forms(self) -> None:
        valid_urls = {
            'https://youtube.com/watch?v=abcdefghijk': ('youtube', 'abcdefghijk'),
            'https://www.youtube.com/watch?v=abcdefghijk': ('youtube', 'abcdefghijk'),
            'https://youtube.com/embed/abcdefghijk': ('youtube', 'abcdefghijk'),
            'https://www.youtube.com/shorts/abcdefghijk?si=shared': ('youtube', 'abcdefghijk'),
            'https://www.youtube-nocookie.com/embed/abcdefghijk?start=30': ('youtube', 'abcdefghijk'),
            'https://youtube.com/watch?v=abcdefghijk&t=30s&list=example': ('youtube', 'abcdefghijk'),
            'https://youtu.be/abcdefghijk?t=30': ('youtube', 'abcdefghijk'),
            'https://youtu.be/abcdefghijk': ('youtube', 'abcdefghijk'),
            'https://vimeo.com/12345678': ('vimeo', '12345678'),
            'https://www.vimeo.com/12345678': ('vimeo', '12345678'),
        }
        for url, expected in valid_urls.items():
            self.assertEqual(parse_lesson_video_url(url), expected)

        invalid_urls = [
            'javascript:alert(1)',
            'data:text/html,hello',
            'http://youtube.com/watch?v=abcdefghijk',
            'https://youtube.com.evil.com/watch?v=abcdefghijk',
            'https://www.youtube.com.evil.com/watch?v=abcdefghijk',
            'https://evil.com/watch?v=abcdefghijk',
            'https://youtu.be/short',
            'https://youtube.com/playlist?list=example',
            'https://youtube.com/shorts/short',
            'https://youtube-nocookie.com.evil.com/embed/abcdefghijk',
        ]
        for url in invalid_urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                parse_lesson_video_url(url)

    def test_admin_lesson_patch_validates_and_stores_video_and_resources(self) -> None:
        response = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={
                    'video_url': 'https://youtu.be/abcdefghijk',
                    'resources': [
                        {'title': '  <b>Reading</b>  ', 'url': ' https://example.com/reading '},
                    ],
                },
            )
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['video'], {'provider': 'youtube', 'id': 'abcdefghijk'})
        self.assertEqual(response.json()['resources'], [{'title': 'Reading', 'url': 'https://example.com/reading'}])
        paid_course = self.loop.run_until_complete(
            self.client.get(f'/courses/{self.course_id}', headers=self.bearer(self.paid_id))
        )
        self.assertEqual(paid_course.status_code, 200, paid_course.text)
        paid_lesson = paid_course.json()['modules'][0]['lessons'][0]
        self.assertEqual(paid_lesson['video'], {'provider': 'youtube', 'id': 'abcdefghijk'})
        self.assertEqual(paid_lesson['resources'], [{'title': 'Reading', 'url': 'https://example.com/reading'}])
        locked_course = self.loop.run_until_complete(
            self.client.get(f'/courses/{self.course_id}', headers=self.bearer(self.free_id))
        )
        self.assertEqual(locked_course.status_code, 403)
        self.assertNotIn('video', locked_course.text)
        self.assertNotIn('example.com/reading', locked_course.text)

        invalid_payloads = [
            {'video_url': 'https://youtube.com.evil.com/watch?v=abcdefghijk'},
            {'resources': [{'title': 'Bad', 'url': 'javascript:alert(1)'}]},
            {'resources': [{'title': 'One', 'url': 'https://example.com/a'}, {'title': 'Two', 'url': 'https://example.com/a'}]},
            {'resources': [{'title': 'Too many', 'url': f'https://example.com/{index}'} for index in range(11)]},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                invalid = self.loop.run_until_complete(
                    self.client.patch(
                        f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                        headers=self.bearer(self.admin_id),
                        json=payload,
                    )
                )
                self.assertEqual(invalid.status_code, 422, invalid.text)

        clear_response = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={'video_url': None, 'resources': []},
            )
        )
        self.assertEqual(clear_response.status_code, 200, clear_response.text)
        self.assertIsNone(clear_response.json()['video'])
        self.assertEqual(clear_response.json()['resources'], [])

    def test_lesson_versions_create_noop_restore_and_prune(self) -> None:
        async def clear_versions_and_count() -> int:
            async with AsyncSessionLocal() as session:
                await session.execute(delete(LessonVersion).where(LessonVersion.lesson_id == self.lesson_id))
                await session.commit()
                return int(await session.scalar(
                    select(func.count()).select_from(LessonVersion).where(LessonVersion.lesson_id == self.lesson_id)
                ) or 0)

        self.assertEqual(self.loop.run_until_complete(clear_versions_and_count()), 0)
        first_change = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={'title': 'Lesson One revised'},
            )
        )
        self.assertEqual(first_change.status_code, 200, first_change.text)

        no_op = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={'title': 'Lesson One revised'},
            )
        )
        self.assertEqual(no_op.status_code, 200, no_op.text)

        second_change = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={'body_html': '<p>Updated body</p>'},
            )
        )
        self.assertEqual(second_change.status_code, 200, second_change.text)
        history = self.loop.run_until_complete(
            self.client.get(f'/admin/lessons/{self.lesson_id}/versions', headers=self.bearer(self.admin_id))
        )
        self.assertEqual(history.status_code, 200, history.text)
        history_body = history.json()
        self.assertEqual([item['version_no'] for item in history_body['items']], [2, 1])
        self.assertNotIn('body_html', history_body['items'][0])
        self.assertEqual(history_body['items'][0]['changed_fields'], ['body_html'])
        first_version_id = history_body['items'][1]['id']
        first_snapshot = self.loop.run_until_complete(
            self.client.get(
                f'/admin/lessons/{self.lesson_id}/versions/{first_version_id}',
                headers=self.bearer(self.admin_id),
            )
        )
        self.assertEqual(first_snapshot.status_code, 200, first_snapshot.text)
        self.assertEqual(first_snapshot.json()['title'], 'Lesson One revised')

        stale_restore = self.loop.run_until_complete(
            self.client.post(
                f'/admin/lessons/{self.lesson_id}/versions/{first_version_id}/restore',
                headers=self.bearer(self.admin_id),
                json={'expected_updated_at': first_change.json()['updated_at']},
            )
        )
        self.assertEqual(stale_restore.status_code, 409, stale_restore.text)

        restored = self.loop.run_until_complete(
            self.client.post(
                f'/admin/lessons/{self.lesson_id}/versions/{first_version_id}/restore',
                headers=self.bearer(self.admin_id),
                json={'expected_updated_at': second_change.json()['updated_at']},
            )
        )
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()['body_html'], '<p>Lesson body</p>')

        for index in range(25):
            response = self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                    headers=self.bearer(self.admin_id),
                    json={'title': f'Lesson {index}'},
                )
            )
            self.assertEqual(response.status_code, 200, response.text)
        retained = self.loop.run_until_complete(
            self.client.get(f'/admin/lessons/{self.lesson_id}/versions', headers=self.bearer(self.admin_id))
        )
        self.assertEqual(len(retained.json()['items']), 20)
        self.assertEqual(retained.json()['items'][0]['version_no'], 28)

        async def reset_fixture_lesson() -> None:
            async with AsyncSessionLocal() as session:
                lesson = await session.get(Lesson, self.lesson_id)
                lesson.title = 'Lesson One'
                lesson.body_html = '<p>Lesson body</p>'
                lesson.try_it_yourself_prompt = 'Reflect'
                lesson.duration_minutes = 0
                lesson.video_provider = None
                lesson.video_id = None
                lesson.resources = []
                await session.commit()

        self.loop.run_until_complete(reset_fixture_lesson())

    def test_duplicate_lesson_recomputes_progress_and_audits_creation(self) -> None:
        async def prepare_progress() -> None:
            async with AsyncSessionLocal() as session:
                await session.execute(delete(LessonProgress).where(
                    LessonProgress.lesson_id == self.lesson_id,
                    LessonProgress.user_id.in_([self.paid_id, self.free_id]),
                ))
                await session.execute(delete(CourseProgress).where(
                    CourseProgress.course_id == self.course_id,
                    CourseProgress.user_id.in_([self.paid_id, self.free_id]),
                ))
                session.add_all([
                    LessonProgress(user_id=self.paid_id, lesson_id=self.lesson_id, completed_at=datetime.now(timezone.utc)),
                    LessonProgress(user_id=self.free_id, lesson_id=self.lesson_id, completed_at=None),
                ])
                await session.commit()

        self.loop.run_until_complete(prepare_progress())
        response = self.loop.run_until_complete(
            self.client.post(
                f'/admin/lessons/{self.lesson_id}/duplicate',
                headers=self.bearer(self.admin_id),
            )
        )
        self.assertEqual(response.status_code, 201, response.text)
        duplicate = response.json()
        self.assertEqual(duplicate['title'], 'Lesson One (copy)')
        self.assertEqual(duplicate['order'], 2)

        async def verify_and_cleanup() -> tuple[dict[uuid.UUID, tuple[int, int, int]], int]:
            async with AsyncSessionLocal() as session:
                rows = (await session.scalars(
                    select(CourseProgress).where(
                        CourseProgress.course_id == self.course_id,
                        CourseProgress.user_id.in_([self.paid_id, self.free_id]),
                    )
                )).all()
                progress = {
                    row.user_id: (row.completed_count, row.total_count, row.percent)
                    for row in rows
                }
                audit_count = int(await session.scalar(
                    select(func.count()).select_from(AuditLog).where(
                        AuditLog.entity_type == 'lesson',
                        AuditLog.entity_id == duplicate['id'],
                        AuditLog.action == 'created',
                    )
                ) or 0)
                await session.execute(delete(Lesson).where(Lesson.id == uuid.UUID(duplicate['id'])))
                await session.execute(delete(LessonProgress).where(
                    LessonProgress.lesson_id == self.lesson_id,
                    LessonProgress.user_id.in_([self.paid_id, self.free_id]),
                ))
                await session.execute(delete(CourseProgress).where(
                    CourseProgress.course_id == self.course_id,
                    CourseProgress.user_id.in_([self.paid_id, self.free_id]),
                ))
                await session.commit()
                return progress, audit_count

        progress, audit_count = self.loop.run_until_complete(verify_and_cleanup())
        self.assertEqual(progress[self.paid_id], (1, 2, 50))
        self.assertEqual(progress[self.free_id], (0, 2, 0))
        self.assertEqual(audit_count, 1)

    def test_free_opportunities_are_capped_and_paid_are_not(self) -> None:
        free_response = self.loop.run_until_complete(
            self.client.get('/opportunities', headers=self.bearer(self.free_id))
        )
        paid_response = self.loop.run_until_complete(
            self.client.get('/opportunities', headers=self.bearer(self.paid_id))
        )
        self.assertEqual(free_response.status_code, 200)
        self.assertEqual(paid_response.status_code, 200)
        self.assertEqual(len(free_response.json()), 4)
        async def opportunity_count() -> int:
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(func.count()).select_from(Opportunity))

        self.assertEqual(len(paid_response.json()), self.loop.run_until_complete(opportunity_count()))

    def test_guest_can_list_courses_and_masterclasses(self) -> None:
        courses_response = self.loop.run_until_complete(self.client.get('/courses'))
        masterclasses_response = self.loop.run_until_complete(self.client.get('/masterclasses'))

        self.assertEqual(courses_response.status_code, 200)
        self.assertEqual(masterclasses_response.status_code, 200)

    def test_non_admin_is_denied_admin_endpoint(self) -> None:
        response = self.loop.run_until_complete(
            self.client.post(
                '/admin/courses',
                headers=self.bearer(self.free_id),
                json={
                    'title': 'Denied Course',
                    'description': 'Should not be created',
                    'access_type': 'free',
                    'status': 'draft',
                },
            )
        )
        self.assertEqual(response.status_code, 403)

    def test_new_course_admin_routes_reject_guests_and_students(self) -> None:
        requests = [
            ('GET', f'/admin/courses/{self.course_id}/readiness', None),
                        ('GET', f'/admin/courses/{self.course_id}/funnel', None),
                        ('GET', f'/admin/courses/{self.course_id}/learners', None),
                        ('GET', f'/admin/lessons/{self.lesson_id}/versions', None),
                        ('GET', f'/admin/lessons/{self.lesson_id}/versions/{uuid.uuid4()}', None),
                        ('POST', f'/admin/lessons/{self.lesson_id}/versions/{uuid.uuid4()}/restore', {'expected_updated_at': datetime.now(timezone.utc).isoformat()}),
                        ('POST', f'/admin/lessons/{self.lesson_id}/duplicate', None),
            ('GET', f'/admin/impact/course/{self.course_id}', None),
            ('GET', f'/admin/impact/module/{self.module_id}', None),
            ('GET', f'/admin/impact/lesson/{self.lesson_id}', None),
            ('POST', f'/admin/courses/{self.course_id}/duplicate', {'title': 'Denied copy'}),
            ('POST', f'/admin/courses/{self.course_id}/publish', None),
            ('POST', f'/admin/courses/{self.course_id}/unpublish', None),
            ('POST', f'/admin/courses/{self.course_id}/structure/reorder', {'structure_revision': 1, 'modules': []}),
        ]
        for method, path, body in requests:
            guest = self.loop.run_until_complete(self.client.request(method, path, json=body))
            student = self.loop.run_until_complete(
                self.client.request(method, path, headers=self.bearer(self.free_id), json=body)
            )
            self.assertEqual(guest.status_code, 401, f'{method} {path}: {guest.text}')
            self.assertEqual(student.status_code, 403, f'{method} {path}: {student.text}')

    def test_course_patch_rejects_null_for_non_nullable_fields(self) -> None:
        requests = [
            ('/admin/courses', self.course_id, {'title': None}),
            ('/admin/courses', self.course_id, {'access_type': None}),
            ('/admin/courses', self.course_id, {'status': None}),
            ('/admin/courses', self.course_id, {'description': None}),
        ]
        for prefix, entity_id, payload in requests:
            response = self.loop.run_until_complete(
                self.client.patch(f'{prefix}/{entity_id}', headers=self.bearer(self.admin_id), json=payload)
            )
            self.assertEqual(response.status_code, 422 if payload != {'description': None} else 200, response.text)

        module_response = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/courses/{self.course_id}/modules/{self.module_id}',
                headers=self.bearer(self.admin_id),
                json={'order': None},
            )
        )
        lesson_response = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={'body_html': None},
            )
        )
        self.assertEqual(module_response.status_code, 422, module_response.text)
        self.assertEqual(lesson_response.status_code, 422, lesson_response.text)

    def test_admin_course_funnel_matches_progress_rows_and_uses_one_funnel_query(self) -> None:
        async def add_completed_lesson() -> None:
            async with AsyncSessionLocal() as session:
                session.add(LessonProgress(user_id=self.paid_id, lesson_id=self.lesson_id, completed_at=datetime.now(timezone.utc)))
                await session.commit()

        self.loop.run_until_complete(add_completed_lesson())
        statements: list[str] = []
        engine = AsyncSessionLocal.kw['bind']

        def capture_select(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
            if statement.lstrip().upper().startswith('SELECT'):
                statements.append(statement)

        event.listen(engine.sync_engine, 'before_cursor_execute', capture_select)
        try:
            response = self.loop.run_until_complete(
                self.client.get(f'/admin/courses/{self.course_id}/funnel', headers=self.bearer(self.admin_id))
            )
        finally:
            event.remove(engine.sync_engine, 'before_cursor_execute', capture_select)

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['learners_started'], 1)
        self.assertEqual(len(body['lessons']), 1)
        self.assertEqual(body['lessons'][0]['lesson_id'], str(self.lesson_id))
        self.assertEqual(body['lessons'][0]['completed_count'], 1)
        self.assertEqual(body['lessons'][0]['percent_of_started'], 100)
        self.assertIsNone(body['largest_drop'])
        funnel_queries = [statement for statement in statements if 'left outer join modules' in statement.lower()]
        self.assertEqual(len(funnel_queries), 1)

        async def direct_sql_counts() -> tuple[int, int]:
            async with AsyncSessionLocal() as session:
                started = await session.scalar(
                    select(func.count(distinct(LessonProgress.user_id)))
                    .join(Lesson, Lesson.id == LessonProgress.lesson_id)
                    .join(Module, Module.id == Lesson.module_id)
                    .where(Module.course_id == self.course_id, LessonProgress.completed_at.is_not(None))
                )
                completed = await session.scalar(
                    select(func.count(distinct(LessonProgress.user_id))).where(
                        LessonProgress.lesson_id == self.lesson_id,
                        LessonProgress.completed_at.is_not(None),
                    )
                )
                return int(started or 0), int(completed or 0)

        started_count, completed_count = self.loop.run_until_complete(direct_sql_counts())
        self.assertEqual(body['learners_started'], started_count)
        self.assertEqual(body['lessons'][0]['completed_count'], completed_count)

        async def remove_completed_lesson() -> None:
            async with AsyncSessionLocal() as session:
                await session.execute(
                    delete(LessonProgress).where(
                        LessonProgress.user_id == self.paid_id,
                        LessonProgress.lesson_id == self.lesson_id,
                    )
                )
                await session.commit()

        self.loop.run_until_complete(remove_completed_lesson())

    def test_admin_course_learners_filters_not_started_by_course_access(self) -> None:
        default_response = self.loop.run_until_complete(
            self.client.get(f'/admin/courses/{self.course_id}/learners', headers=self.bearer(self.admin_id))
        )
        self.assertEqual(default_response.status_code, 200, default_response.text)
        self.assertEqual(default_response.json()['items'], [])
        self.assertGreaterEqual(default_response.json()['facets']['not_started'], 1)

        statements: list[str] = []
        engine = AsyncSessionLocal.kw['bind']

        def capture_select(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
            if statement.lstrip().upper().startswith('SELECT'):
                statements.append(statement)

        event.listen(engine.sync_engine, 'before_cursor_execute', capture_select)
        try:
            response = self.loop.run_until_complete(
                self.client.get(
                    f'/admin/courses/{self.course_id}/learners?status=not_started',
                    headers=self.bearer(self.admin_id),
                )
            )
        finally:
            event.remove(engine.sync_engine, 'before_cursor_execute', capture_select)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        matching_student = next((item for item in body['items'] if item['user']['id'] == str(self.paid_id)), None)
        self.assertIsNotNone(matching_student, body)
        self.assertGreaterEqual(body['total'], 1)
        self.assertEqual(matching_student['plan_state'], 'paid')
        self.assertEqual(matching_student['status'], 'not_started')
        self.assertEqual(matching_student['completed_lessons'], 0)
        self.assertEqual(matching_student['total_lessons'], 1)
        self.assertGreaterEqual(body['facets']['not_started'], 1)
        self.assertLessEqual(len(statements), 4, statements)

    def test_lesson_image_sanitizer_allows_only_backend_media_with_alt_text(self) -> None:
        media_url = f'{get_settings().API_BASE_URL}/media/public/11111111-1111-4111-8111-111111111111.png'
        safe = sanitize_lesson_html(f'<p>Text</p><img src="{media_url}" alt="Diagram">')
        self.assertIn('<img', safe)
        self.assertIn('alt="Diagram"', safe)
        external = sanitize_lesson_html('<img src="https://example.org/image.png" alt="External">')
        self.assertNotIn('src="https://example.org/image.png"', external)
        with self.assertRaises(ValueError):
            sanitize_lesson_html(f'<img src="{media_url}">')

    def test_course_status_changes_use_publish_audit_actions(self) -> None:
        try:
            unpublished = self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/courses/{self.course_id}',
                    headers=self.bearer(self.admin_id),
                    json={'status': 'draft'},
                )
            )
            self.assertEqual(unpublished.status_code, 200, unpublished.text)
            published = self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/courses/{self.course_id}',
                    headers=self.bearer(self.admin_id),
                    json={'status': 'published'},
                )
            )
            self.assertEqual(published.status_code, 200, published.text)
        finally:
            self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/courses/{self.course_id}',
                    headers=self.bearer(self.admin_id),
                    json={'status': 'published'},
                )
            )

        async def status_actions() -> list[str]:
            async with AsyncSessionLocal() as session:
                rows = await session.scalars(
                    select(AuditLog)
                    .where(AuditLog.actor_id == self.admin_id, AuditLog.entity_id == str(self.course_id))
                    .order_by(AuditLog.created_at.asc())
                )
                return [row.action for row in rows]

        actions = self.loop.run_until_complete(status_actions())
        self.assertIn('unpublished', actions)
        self.assertIn('published', actions)

    def test_admin_course_create_response_matches_admin_summary_contract(self) -> None:
        response = self.loop.run_until_complete(
            self.client.post(
                '/admin/courses',
                headers=self.bearer(self.admin_id),
                json={
                    'title': 'Admin response contract course',
                    'description': None,
                    'access_type': 'free',
                    'status': 'draft',
                },
            )
        )
        self.assertEqual(response.status_code, 201, response.text)
        course_id = uuid.UUID(response.json()['id'])
        try:
            self.assertEqual(response.json()['status'], 'draft')
            self.assertEqual(response.json()['module_count'], 0)
        finally:
            self.loop.run_until_complete(
                self.client.delete(f'/admin/courses/{course_id}', headers=self.bearer(self.admin_id))
            )

    def test_admin_course_list_filters_pages_and_reports_progress_metrics(self) -> None:
        async def set_progress() -> None:
            async with AsyncSessionLocal() as session:
                session.add(LessonProgress(user_id=self.paid_id, lesson_id=self.lesson_id, completed_at=datetime.now(timezone.utc)))
                await session.commit()

        self.loop.run_until_complete(set_progress())
        response = self.loop.run_until_complete(
            self.client.get(
                '/admin/courses',
                headers=self.bearer(self.admin_id),
                params={'search': 'Members Course', 'status': 'published', 'access_type': 'members_only', 'sort': 'learners', 'limit': 10, 'offset': 0},
            )
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 1)
        self.assertEqual(response.json()['limit'], 10)
        course = response.json()['items'][0]
        self.assertEqual(course['id'], str(self.course_id))
        self.assertEqual(course['module_count'], 1)
        self.assertEqual(course['lesson_count'], 1)
        self.assertEqual(course['learners_started'], 1)
        self.assertEqual(course['learners_completed'], 1)

        legacy = self.loop.run_until_complete(
            self.client.get('/admin/courses?status=published', headers=self.bearer(self.admin_id))
        )
        self.assertEqual(legacy.status_code, 200, legacy.text)
        self.assertIsInstance(legacy.json(), list)

    def test_recent_course_ties_sort_by_title_before_random_identifier(self) -> None:
        identifiers = sorted([uuid.uuid4(), uuid.uuid4()])
        prefix = 'rrp-order-' + str(uuid.uuid4())
        async def check() -> None:
            try:
                async with AsyncSessionLocal() as session:
                    moment = datetime.now(timezone.utc)
                    session.add_all([
                        Course(id=identifiers[1], title=prefix + ' A', updated_at=moment,
                               access_type=AccessType.free, status=CourseStatus.draft),
                        Course(id=identifiers[0], title=prefix + ' Z', updated_at=moment,
                               access_type=AccessType.free, status=CourseStatus.draft),
                    ])
                    await session.commit()
                statements = []
                def capture(connection, cursor, statement, parameters, context, many):
                    statements.append(statement)
                engine = AsyncSessionLocal.kw['bind'].sync_engine
                event.listen(engine, 'before_cursor_execute', capture)
                try:
                    response = await self.client.get('/admin/courses', headers=self.bearer(self.admin_id),
                                                     params={'search': prefix, 'sort': 'updated', 'limit': 10})
                finally:
                    event.remove(engine, 'before_cursor_execute', capture)
                self.assertEqual(response.status_code, 200)
                self.assertEqual([row['id'] for row in response.json()['items']],
                                 [str(identifiers[1]), str(identifiers[0])])
                print('RRP_ADMIN_COURSE_LIST_SQL_QUERIES', len(statements))
            finally:
                async with AsyncSessionLocal() as session:
                    result = await session.execute(delete(Course).where(Course.id.in_(identifiers)))
                    await session.commit()
                    print('RRP_ORDER_COURSES_REMOVED', result.rowcount)
        self.loop.run_until_complete(check())

    def test_admin_course_hierarchy_lifecycle_and_audit_labels(self) -> None:
        title = 'Course hierarchy lifecycle test'
        created = self.loop.run_until_complete(
            self.client.post(
                '/admin/courses',
                headers=self.bearer(self.admin_id),
                json={'title': title, 'summary': 'A complete course summary', 'description': 'Draft description', 'access_type': 'free', 'status': 'draft'},
            )
        )
        self.assertEqual(created.status_code, 201, created.text)
        course_id = uuid.UUID(created.json()['id'])
        module_id = None
        lesson_id = None
        try:
            second_module = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/courses/{course_id}/modules',
                    headers=self.bearer(self.admin_id),
                    json={'title': 'Module Two', 'order': 2},
                )
            )
            first_module = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/courses/{course_id}/modules',
                    headers=self.bearer(self.admin_id),
                    json={'title': 'Module One', 'order': 1},
                )
            )
            self.assertEqual(second_module.status_code, 201, second_module.text)
            self.assertEqual(first_module.status_code, 201, first_module.text)
            module_id = uuid.UUID(first_module.json()['id'])
            second_module_id = uuid.UUID(second_module.json()['id'])
            second_module_lesson = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/modules/{second_module_id}/lessons',
                    headers=self.bearer(self.admin_id),
                    json={'title': 'Module Two Lesson', 'body_html': '<p>Complete</p>', 'order': 1},
                )
            )
            self.assertEqual(second_module_lesson.status_code, 201, second_module_lesson.text)
            second_lesson = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/modules/{module_id}/lessons',
                    headers=self.bearer(self.admin_id),
                    json={'title': 'Lesson Two', 'body_html': '<p>Second</p>', 'order': 2},
                )
            )
            first_lesson = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/modules/{module_id}/lessons',
                    headers=self.bearer(self.admin_id),
                    json={
                        'title': 'Lesson One',
                        'body_html': '<p>Safe</p><script>unsafe()</script>',
                        'try_it_yourself_prompt': 'Reflect',
                        'order': 1,
                    },
                )
            )
            self.assertEqual(second_lesson.status_code, 201, second_lesson.text)
            self.assertEqual(first_lesson.status_code, 201, first_lesson.text)
            lesson_id = uuid.UUID(first_lesson.json()['id'])
            self.assertNotIn('<script', first_lesson.json()['body_html'])

            detail = self.loop.run_until_complete(
                self.client.get(f'/admin/courses/{course_id}', headers=self.bearer(self.admin_id))
            )
            self.assertEqual(detail.status_code, 200, detail.text)
            self.assertEqual([module['title'] for module in detail.json()['modules']], ['Module One', 'Module Two'])
            self.assertEqual(
                [lesson['title'] for lesson in detail.json()['modules'][0]['lessons']],
                ['Lesson One', 'Lesson Two'],
            )

            updated = self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/courses/{course_id}',
                    headers=self.bearer(self.admin_id),
                    json={'description': None, 'status': 'published'},
                )
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(updated.json()['status'], 'published')
            self.assertIsNone(updated.json()['description'])

            lesson_update = self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/modules/{module_id}/lessons/{lesson_id}',
                    headers=self.bearer(self.admin_id),
                    json={'body_html': '<p>Updated</p><script>unsafe()</script>', 'try_it_yourself_prompt': None},
                )
            )
            self.assertEqual(lesson_update.status_code, 200, lesson_update.text)
            self.assertNotIn('<script', lesson_update.json()['body_html'])
            self.assertIsNone(lesson_update.json()['try_it_yourself_prompt'])

            labels = self.loop.run_until_complete(
                self._course_audit_labels(
                    [course_id, module_id, second_module_id, lesson_id, uuid.UUID(second_lesson.json()['id'])]
                )
            )
            self.assertIn(('course', 'created', title), labels)
            self.assertIn(('course', 'published', title), labels)
            self.assertIn(('module', 'created', 'Module One'), labels)
            self.assertIn(('lesson', 'created', 'Lesson One'), labels)
            self.assertIn(('lesson', 'updated', 'Lesson One'), labels)
        finally:
            cleanup = self.loop.run_until_complete(
                self.client.delete(
                    f'/admin/courses/{course_id}',
                    headers=self.bearer(self.admin_id),
                    params={'confirm_progress_loss': 'true', 'confirm_title': title},
                )
            )
            self.assertIn(cleanup.status_code, (204, 404), cleanup.text)

    def test_readiness_blocks_publish_errors_but_allows_warnings(self) -> None:
        title = 'b3-readiness-course'
        created = self.loop.run_until_complete(
            self.client.post(
                '/admin/courses',
                headers=self.bearer(self.admin_id),
                json={'title': title, 'access_type': 'free'},
            )
        )
        self.assertEqual(created.status_code, 201, created.text)
        course_id = uuid.UUID(created.json()['id'])
        try:
            readiness = self.loop.run_until_complete(
                self.client.get(f'/admin/courses/{course_id}/readiness', headers=self.bearer(self.admin_id))
            )
            self.assertEqual(readiness.status_code, 200, readiness.text)
            self.assertGreaterEqual(readiness.json()['errors'], 1)
            self.assertGreaterEqual(readiness.json()['warnings'], 1)
            self.assertTrue(all(isinstance(check['message'], str) and check['message'].strip()
                                for check in readiness.json()['checks']))
            blocked = self.loop.run_until_complete(
                self.client.post(f'/admin/courses/{course_id}/publish', headers=self.bearer(self.admin_id))
            )
            self.assertEqual(blocked.status_code, 422, blocked.text)
            self.assertEqual(blocked.json()['detail']['code'], 'not_ready')

            self.loop.run_until_complete(
                self.client.patch(
                    f'/admin/courses/{course_id}',
                    headers=self.bearer(self.admin_id),
                    json={'summary': 'b3-ready-summary', 'thumbnail_url': 'https://example.org/course.png'},
                )
            )
            module = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/courses/{course_id}/modules',
                    headers=self.bearer(self.admin_id),
                    json={'title': 'b3-module', 'order': 1},
                )
            )
            lesson = self.loop.run_until_complete(
                self.client.post(
                    f"/admin/modules/{module.json()['id']}/lessons",
                    headers=self.bearer(self.admin_id),
                    json={'title': 'b3-lesson', 'body_html': '<p>Ready content</p>', 'duration_minutes': 12, 'order': 1},
                )
            )
            self.assertEqual(lesson.status_code, 201, lesson.text)
            readiness = self.loop.run_until_complete(
                self.client.get(f'/admin/courses/{course_id}/readiness', headers=self.bearer(self.admin_id))
            )
            self.assertEqual(readiness.json()['errors'], 0)
            self.assertGreaterEqual(readiness.json()['warnings'], 1)
            published = self.loop.run_until_complete(
                self.client.post(f'/admin/courses/{course_id}/publish', headers=self.bearer(self.admin_id))
            )
            self.assertEqual(published.status_code, 200, published.text)
            self.assertEqual(published.json()['status'], 'published')
            unpublished = self.loop.run_until_complete(
                self.client.post(f'/admin/courses/{course_id}/unpublish', headers=self.bearer(self.admin_id))
            )
            self.assertEqual(unpublished.status_code, 200, unpublished.text)
            self.assertEqual(unpublished.json()['status'], 'draft')
        finally:
            self.loop.run_until_complete(
                self.client.delete(
                    f'/admin/courses/{course_id}',
                    headers=self.bearer(self.admin_id),
                    params={'confirm_progress_loss': 'true', 'confirm_title': title},
                )
            )

    def test_duplicate_course_copies_curriculum_without_progress(self) -> None:
        async def mark_source_progress() -> None:
            async with AsyncSessionLocal() as session:
                progress = await session.scalar(
                    select(LessonProgress).where(
                        LessonProgress.user_id == self.paid_id,
                        LessonProgress.lesson_id == self.lesson_id,
                    )
                )
                if progress is None:
                    session.add(LessonProgress(user_id=self.paid_id, lesson_id=self.lesson_id, completed_at=datetime.now(timezone.utc)))
                else:
                    progress.completed_at = datetime.now(timezone.utc)
                await session.commit()

        self.loop.run_until_complete(mark_source_progress())
        duplicate = self.loop.run_until_complete(
            self.client.post(
                f'/admin/courses/{self.course_id}/duplicate',
                headers=self.bearer(self.admin_id),
                json={'title': 'b3-duplicate-course'},
            )
        )
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        duplicate_id = uuid.UUID(duplicate.json()['id'])
        try:
            self.assertEqual(duplicate.json()['status'], 'draft')
            self.assertEqual(duplicate.json()['module_count'], 1)
            detail = self.loop.run_until_complete(
                self.client.get(f'/admin/courses/{duplicate_id}', headers=self.bearer(self.admin_id))
            )
            duplicated_lesson_id = uuid.UUID(detail.json()['modules'][0]['lessons'][0]['id'])
            async def duplicate_progress_count() -> int:
                async with AsyncSessionLocal() as session:
                    return await session.scalar(select(func.count(LessonProgress.id)).where(LessonProgress.lesson_id == duplicated_lesson_id))
            self.assertEqual(self.loop.run_until_complete(duplicate_progress_count()), 0)
        finally:
            self.loop.run_until_complete(
                self.client.delete(f'/admin/courses/{duplicate_id}', headers=self.bearer(self.admin_id))
            )
            async def clear_source_progress() -> None:
                async with AsyncSessionLocal() as session:
                    await session.execute(delete(LessonProgress).where(LessonProgress.user_id == self.paid_id, LessonProgress.lesson_id == self.lesson_id))
                    await session.execute(delete(CourseProgress).where(CourseProgress.user_id == self.paid_id, CourseProgress.course_id == self.course_id))
                    await session.commit()
            self.loop.run_until_complete(clear_source_progress())

    def test_course_impact_and_delete_require_exact_title_for_progress(self) -> None:
        title = 'b3-impact-course'
        course = Course(title=title, summary='Impact summary', access_type=AccessType.free, status=CourseStatus.draft)
        module = Module(title='b3-impact-module', order=1)
        lesson = Lesson(title='b3-impact-lesson', body_html='<p>Progress</p>', order=1)
        module.lessons = [lesson]
        course.modules = [module]
        async def create_impact_course() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
            async with AsyncSessionLocal() as session:
                session.add(course)
                await session.flush()
                session.add(LessonProgress(user_id=self.paid_id, lesson_id=lesson.id, completed_at=datetime.now(timezone.utc)))
                await persist_course_progress(session, self.paid_id, course.id)
                await session.commit()
                return course.id, module.id, lesson.id
        course_id, module_id, lesson_id = self.loop.run_until_complete(create_impact_course())
        try:
            for path, expected_rows in [
                (f'/admin/impact/course/{course_id}', ('learners_with_progress', 1)),
                (f'/admin/impact/module/{module_id}', ('learners_with_progress', 1)),
                (f'/admin/impact/lesson/{lesson_id}', ('learners_with_progress', 1)),
            ]:
                response = self.loop.run_until_complete(self.client.get(path, headers=self.bearer(self.admin_id)))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()[expected_rows[0]], expected_rows[1])

            denied = self.loop.run_until_complete(
                self.client.delete(f'/admin/courses/{course_id}', headers=self.bearer(self.admin_id))
            )
            wrong_title = self.loop.run_until_complete(
                self.client.delete(
                    f'/admin/courses/{course_id}',
                    headers=self.bearer(self.admin_id),
                    params={'confirm_progress_loss': 'true', 'confirm_title': 'wrong'},
                )
            )
            self.assertEqual(denied.status_code, 409)
            self.assertEqual(wrong_title.status_code, 409)
            deleted = self.loop.run_until_complete(
                self.client.delete(
                    f'/admin/courses/{course_id}',
                    headers=self.bearer(self.admin_id),
                    params={'confirm_progress_loss': 'true', 'confirm_title': title},
                )
            )
            self.assertEqual(deleted.status_code, 204)
            async def progress_count() -> int:
                async with AsyncSessionLocal() as session:
                    return await session.scalar(select(func.count(LessonProgress.id)).where(LessonProgress.lesson_id == lesson_id))
            self.assertEqual(self.loop.run_until_complete(progress_count()), 0)
        finally:
            async def cleanup() -> None:
                async with AsyncSessionLocal() as session:
                    await session.execute(delete(Course).where(Course.id == course_id))
                    await session.commit()
            self.loop.run_until_complete(cleanup())

    def test_module_and_lesson_delete_confirm_progress_and_refresh_summary(self) -> None:
        title = 'b3-delete-impact-course'
        course = Course(title=title, summary='Delete impact summary', access_type=AccessType.free, status=CourseStatus.draft)
        module = Module(title='b3-delete-impact-module', order=1)
        lesson = Lesson(title='b3-delete-impact-lesson', body_html='<p>Progress</p>', order=1)
        module.lessons = [lesson]
        course.modules = [module]

        async def create_fixture() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
            async with AsyncSessionLocal() as session:
                session.add(course)
                await session.flush()
                session.add(LessonProgress(user_id=self.paid_id, lesson_id=lesson.id, completed_at=datetime.now(timezone.utc)))
                await persist_course_progress(session, self.paid_id, course.id)
                await session.commit()
                return course.id, module.id, lesson.id

        course_id, module_id, lesson_id = self.loop.run_until_complete(create_fixture())
        try:
            lesson_denied = self.loop.run_until_complete(
                self.client.delete(f'/admin/modules/{module_id}/lessons/{lesson_id}', headers=self.bearer(self.admin_id))
            )
            lesson_deleted = self.loop.run_until_complete(
                self.client.delete(
                    f'/admin/modules/{module_id}/lessons/{lesson_id}',
                    headers=self.bearer(self.admin_id),
                    params={'confirm_progress_loss': 'true', 'confirm_title': 'b3-delete-impact-lesson'},
                )
            )
            self.assertEqual(lesson_denied.status_code, 409)
            self.assertEqual(lesson_deleted.status_code, 204)

            second_lesson = Lesson(module_id=module_id, title='b3-second-lesson', body_html='<p>Second</p>', order=2)
            async def add_second_progress() -> uuid.UUID:
                async with AsyncSessionLocal() as session:
                    session.add(second_lesson)
                    await session.flush()
                    session.add(LessonProgress(user_id=self.paid_id, lesson_id=second_lesson.id, completed_at=datetime.now(timezone.utc)))
                    await persist_course_progress(session, self.paid_id, course_id)
                    await session.commit()
                    return second_lesson.id
            second_lesson_id = self.loop.run_until_complete(add_second_progress())
            module_denied = self.loop.run_until_complete(
                self.client.delete(f'/admin/courses/{course_id}/modules/{module_id}', headers=self.bearer(self.admin_id))
            )
            module_deleted = self.loop.run_until_complete(
                self.client.delete(
                    f'/admin/courses/{course_id}/modules/{module_id}',
                    headers=self.bearer(self.admin_id),
                    params={'confirm_progress_loss': 'true', 'confirm_title': 'b3-delete-impact-module'},
                )
            )
            self.assertEqual(module_denied.status_code, 409)
            self.assertEqual(module_deleted.status_code, 204)

            async def counts() -> tuple[int, int, int]:
                async with AsyncSessionLocal() as session:
                    remaining_source = await session.scalar(select(func.count(LessonProgress.id)).where(LessonProgress.lesson_id.in_([lesson_id, second_lesson_id])))
                    summary = await session.scalar(select(CourseProgress).where(CourseProgress.user_id == self.paid_id, CourseProgress.course_id == course_id))
                    return remaining_source, summary.total_count, summary.completed_count

            self.assertEqual(self.loop.run_until_complete(counts()), (0, 0, 0))
        finally:
            async def cleanup() -> None:
                async with AsyncSessionLocal() as session:
                    await session.execute(delete(Course).where(Course.id == course_id))
                    await session.execute(delete(CourseProgress).where(CourseProgress.course_id == course_id))
                    await session.commit()
            self.loop.run_until_complete(cleanup())

    def test_structure_reorder_checks_revision_and_preserves_progress(self) -> None:
        title = 'b3-reorder-course'
        course = Course(title=title, summary='Reorder summary', access_type=AccessType.free, status=CourseStatus.draft)
        first_module = Module(title='b3-module-a', order=1)
        first_lesson = Lesson(title='b3-lesson-a', body_html='<p>A</p>', order=1, duration_minutes=10)
        first_module.lessons = [first_lesson]
        course.modules = [first_module]
        async def create_reorder_course() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
            async with AsyncSessionLocal() as session:
                session.add(course)
                await session.flush()
                session.add(LessonProgress(user_id=self.paid_id, lesson_id=first_lesson.id, completed_at=datetime.now(timezone.utc)))
                await persist_course_progress(session, self.paid_id, course.id)
                await session.commit()
                return course.id, first_module.id, first_lesson.id
        course_id, first_module_id, first_lesson_id = self.loop.run_until_complete(create_reorder_course())
        second_module = self.loop.run_until_complete(
            self.client.post(
                f'/admin/courses/{course_id}/modules',
                headers=self.bearer(self.admin_id),
                json={'title': 'b3-module-b', 'order': 2},
            )
        )
        self.assertEqual(second_module.status_code, 201, second_module.text)
        second_module_id = uuid.UUID(second_module.json()['id'])
        second_lesson = self.loop.run_until_complete(
            self.client.post(
                f'/admin/modules/{second_module_id}/lessons',
                headers=self.bearer(self.admin_id),
                json={'title': 'b3-lesson-b', 'body_html': '<p>B</p>', 'duration_minutes': 12, 'order': 1},
            )
        )
        self.assertEqual(second_lesson.status_code, 201, second_lesson.text)
        second_lesson_id = uuid.UUID(second_lesson.json()['id'])
        before = self.loop.run_until_complete(
            self.client.get(f'/admin/courses/{course_id}', headers=self.bearer(self.admin_id))
        ).json()
        try:
            reordered = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/courses/{course_id}/structure/reorder',
                    headers=self.bearer(self.admin_id),
                    json={
                        'structure_revision': before['structure_revision'],
                        'modules': [
                            {'id': str(second_module_id), 'lessons': [{'id': str(first_lesson_id)}, {'id': str(second_lesson_id)}]},
                            {'id': str(first_module_id), 'lessons': []},
                        ],
                    },
                )
            )
            self.assertEqual(reordered.status_code, 200, reordered.text)
            self.assertEqual(reordered.json()['modules'][0]['id'], str(second_module_id))
            self.assertEqual(reordered.json()['modules'][0]['lessons'][0]['id'], str(first_lesson_id))
            stale = self.loop.run_until_complete(
                self.client.post(
                    f'/admin/courses/{course_id}/structure/reorder',
                    headers=self.bearer(self.admin_id),
                    json={'structure_revision': before['structure_revision'], 'modules': []},
                )
            )
            self.assertEqual(stale.status_code, 409, stale.text)
            async def persisted_progress() -> tuple[int, int, int]:
                async with AsyncSessionLocal() as session:
                    progress_rows = await session.scalar(select(func.count(LessonProgress.id)).where(LessonProgress.lesson_id == first_lesson_id))
                    summary = await session.scalar(select(CourseProgress).where(CourseProgress.user_id == self.paid_id, CourseProgress.course_id == course_id))
                    return progress_rows, summary.total_count, summary.completed_count
            self.assertEqual(self.loop.run_until_complete(persisted_progress()), (1, 2, 1))
        finally:
            async def cleanup() -> None:
                async with AsyncSessionLocal() as session:
                    await session.execute(delete(Course).where(Course.id == course_id))
                    await session.execute(delete(CourseProgress).where(CourseProgress.course_id == course_id))
                    await session.commit()
            self.loop.run_until_complete(cleanup())

    def test_course_module_lesson_patches_reject_stale_updated_at(self) -> None:
        stale = '2000-01-01T00:00:00Z'
        course = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/courses/{self.course_id}',
                headers=self.bearer(self.admin_id),
                json={'description': 'stale', 'expected_updated_at': stale},
            )
        )
        module = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/courses/{self.course_id}/modules/{self.module_id}',
                headers=self.bearer(self.admin_id),
                json={'title': 'stale module', 'expected_updated_at': stale},
            )
        )
        lesson = self.loop.run_until_complete(
            self.client.patch(
                f'/admin/modules/{self.module_id}/lessons/{self.lesson_id}',
                headers=self.bearer(self.admin_id),
                json={'title': 'stale lesson', 'expected_updated_at': stale},
            )
        )
        for response in (course, module, lesson):
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(response.json()['detail']['code'], 'stale_version')

    async def _course_audit_labels(self, entity_ids: list[uuid.UUID]) -> set[tuple[str, str, str | None]]:
        async with AsyncSessionLocal() as session:
            rows = await session.scalars(
                select(AuditLog).where(AuditLog.actor_id == self.admin_id, AuditLog.entity_id.in_([str(value) for value in entity_ids]))
            )
            return {
                (row.entity_type, row.action, (row.extra_data or {}).get('label'))
                for row in rows
            }

    def test_admin_course_facets_match_direct_sql_and_use_one_aggregate(self) -> None:
        async def expected_facets() -> dict[str, int]:
            async with AsyncSessionLocal() as session:
                row = (
                    await session.execute(
                        select(
                            func.count(Course.id).label('all'),
                            func.count(Course.id).filter(Course.status == CourseStatus.published).label('published'),
                            func.count(Course.id).filter(Course.status == CourseStatus.draft).label('draft'),
                            func.count(Course.id).filter(Course.access_type == 'free').label('free'),
                            func.count(Course.id).filter(Course.access_type == 'members_only').label('members_only'),
                        )
                    )
                ).one()
                return dict(row._mapping)

        expected = self.loop.run_until_complete(expected_facets())
        statements: list[str] = []

        def count_selects(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
            if statement.lstrip().upper().startswith('SELECT'):
                statements.append(statement)

        bind = AsyncSessionLocal.kw['bind'].sync_engine
        event.listen(bind, 'before_cursor_execute', count_selects)
        try:
            response = self.loop.run_until_complete(self.client.get('/admin/courses/facets', headers=self.bearer(self.admin_id)))
        finally:
            event.remove(bind, 'before_cursor_execute', count_selects)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), expected)
        self.assertEqual(len(statements), 2, statements)

    def test_admin_course_stats_match_direct_sql_and_use_aggregates(self) -> None:
        async def expected_stats() -> dict[str, object]:
            async with AsyncSessionLocal() as session:
                structure = (
                    await session.execute(
                        select(
                            func.count(distinct(Module.id)).label('module_count'),
                            func.count(Lesson.id).label('lesson_count'),
                            func.coalesce(func.sum(Lesson.duration_minutes), 0).label('total_minutes'),
                            func.coalesce(func.sum(case((Lesson.duration_minutes <= 0, 1), else_=0)), 0).label('lessons_without_duration'),
                        )
                        .select_from(Course)
                        .outerjoin(Module, Module.course_id == Course.id)
                        .outerjoin(Lesson, Lesson.module_id == Module.id)
                        .where(Course.id == self.course_id)
                    )
                ).one()
                learners = (
                    await session.execute(
                        select(
                            LessonProgress.user_id,
                            func.count(distinct(LessonProgress.lesson_id)).label('completed_count'),
                            func.max(LessonProgress.completed_at).label('last_activity_at'),
                        )
                        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
                        .join(Module, Module.id == Lesson.module_id)
                        .where(Module.course_id == self.course_id, LessonProgress.completed_at.is_not(None))
                        .group_by(LessonProgress.user_id)
                    )
                ).all()
                total = structure.lesson_count
                percentages = [min(100, row.completed_count * 100.0 / total) for row in learners] if total else []
                completed = sum(1 for row in learners if total > 0 and row.completed_count >= total)
                activity = max((row.last_activity_at for row in learners if row.last_activity_at), default=None)
                return {
                    'module_count': structure.module_count,
                    'lesson_count': total,
                    'total_minutes': structure.total_minutes,
                    'lessons_without_duration': structure.lessons_without_duration,
                    'learners_started': len(learners),
                    'learners_completed': completed,
                    'completion_rate': completed * 100.0 / len(learners) if learners else 0.0,
                    'average_progress': sum(percentages) / len(percentages) if percentages else 0.0,
                    'last_learner_activity_at': activity,
                }

        expected = self.loop.run_until_complete(expected_stats())
        statements: list[str] = []

        def count_selects(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
            if statement.lstrip().upper().startswith('SELECT'):
                statements.append(statement)

        bind = AsyncSessionLocal.kw['bind'].sync_engine
        event.listen(bind, 'before_cursor_execute', count_selects)
        try:
            response = self.loop.run_until_complete(
                self.client.get(f'/admin/courses/{self.course_id}/stats', headers=self.bearer(self.admin_id))
            )
        finally:
            event.remove(bind, 'before_cursor_execute', count_selects)

        self.assertEqual(response.status_code, 200, response.text)
        actual = response.json()
        for key, value in expected.items():
            if isinstance(value, float):
                self.assertAlmostEqual(actual[key], value)
            elif isinstance(value, datetime):
                self.assertEqual(datetime.fromisoformat(actual[key].replace('Z', '+00:00')), value)
            else:
                self.assertEqual(actual[key], value)
        self.assertEqual(len(statements), 3, statements)

    def test_course_facets_and_stats_reject_guest_and_student(self) -> None:
        for path in ('/admin/courses/facets', f'/admin/courses/{self.course_id}/stats'):
            guest = self.loop.run_until_complete(self.client.get(path))
            student = self.loop.run_until_complete(self.client.get(path, headers=self.bearer(self.free_id)))
            self.assertEqual(guest.status_code, 401, guest.text)
            self.assertEqual(student.status_code, 403, student.text)
