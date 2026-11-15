from tests import configure_test_environment

configure_test_environment()

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest import TestCase

import httpx
from sqlalchemy import delete, func, select

from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import (
    AuditLog,
    Course,
    CourseProgress,
    CourseStatus,
    Lesson,
    LessonProgress,
    Module,
    Subscription,
    SubscriptionPlan,
    SubscriptionStatus,
    User,
    UserRole,
)


class ProgressTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        cls.loop.run_until_complete(cls.create_fixtures())

    def tearDown(self) -> None:
        async def reset_progress() -> None:
            async with AsyncSessionLocal() as session:
                await session.execute(delete(LessonProgress).where(LessonProgress.user_id == self.paid_id))
                await session.execute(delete(CourseProgress).where(CourseProgress.user_id == self.paid_id))
                await session.commit()

        self.loop.run_until_complete(reset_progress())

    @classmethod
    async def create_fixtures(cls) -> None:
        cls.admin_id = uuid.uuid4()
        cls.paid_id = uuid.uuid4()
        cls.free_id = uuid.uuid4()
        cls.course_id = uuid.uuid4()
        cls.module_id = uuid.uuid4()
        cls.lesson_ids = [uuid.uuid4() for _ in range(3)]
        async with AsyncSessionLocal() as session:
            admin = User(id=cls.admin_id, email=f'{cls.admin_id}@progress.test', hashed_password='unused', role=UserRole.admin)
            paid = User(id=cls.paid_id, email=f'{cls.paid_id}@progress.test', hashed_password='unused', role=UserRole.student)
            free = User(id=cls.free_id, email=f'{cls.free_id}@progress.test', hashed_password='unused', role=UserRole.student)
            paid.subscriptions = [Subscription(plan=SubscriptionPlan.monthly, status=SubscriptionStatus.active, current_period_end=datetime.now(timezone.utc) + timedelta(days=30))]
            course = Course(id=cls.course_id, title='Progress Course', access_type='members_only', status=CourseStatus.published)
            module = Module(id=cls.module_id, course_id=cls.course_id, title='Progress Module', order=1)
            module.lessons = [
                Lesson(id=lesson_id, title=f'Lesson {index}', body_html=f'<p>Body {index}</p>', order=index)
                for index, lesson_id in enumerate(cls.lesson_ids, start=1)
            ]
            course.modules = [module]
            session.add_all([admin, paid, free, course])
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
            await session.execute(delete(AuditLog).where(AuditLog.actor_id == cls.admin_id))
            await session.execute(delete(Course).where(Course.id == cls.course_id))
            await session.execute(delete(User).where(User.id.in_([cls.admin_id, cls.paid_id, cls.free_id])))
            await session.commit()

    @staticmethod
    def headers(user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def request(self, method: str, path: str, user_id: uuid.UUID):
        return self.loop.run_until_complete(self.client.request(method, path, headers=self.headers(user_id)))

    def test_paid_progress_is_idempotent_and_reversible(self) -> None:
        lesson_id = self.lesson_ids[0]
        complete = self.request('POST', f'/lessons/{lesson_id}/complete', self.paid_id)
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.json()['progress'], {'completed_count': 1, 'total_count': 3, 'percent': 33})

        detail = self.request('GET', f'/courses/{self.course_id}', self.paid_id)
        self.assertEqual(detail.status_code, 200)
        lessons = detail.json()['modules'][0]['lessons']
        self.assertEqual([lesson['completed'] for lesson in lessons], [True, False, False])

        self.loop.run_until_complete(self.request_count())
        duplicate = self.request('POST', f'/lessons/{lesson_id}/complete', self.paid_id)
        self.assertEqual(duplicate.status_code, 200)
        self.loop.run_until_complete(self.request_count())
        self.assertEqual(self.before_count, self.after_count)

        unmark = self.request('DELETE', f'/lessons/{lesson_id}/complete', self.paid_id)
        self.assertEqual(unmark.status_code, 200)
        self.assertEqual(unmark.json()['progress'], {'completed_count': 0, 'total_count': 3, 'percent': 0})
        remark = self.request('POST', f'/lessons/{lesson_id}/complete', self.paid_id)
        self.assertEqual(remark.status_code, 200)
        self.assertEqual(remark.json()['progress'], {'completed_count': 1, 'total_count': 3, 'percent': 33})

    async def request_count(self) -> None:
        async with AsyncSessionLocal() as session:
            count = await session.scalar(
                select(func.count(LessonProgress.id)).where(
                    LessonProgress.user_id == self.paid_id,
                    LessonProgress.lesson_id == self.lesson_ids[0],
                )
            )
        if not hasattr(self, 'before_count'):
            self.before_count = count
        else:
            self.after_count = count

    def test_free_student_cannot_complete_members_only_lesson(self) -> None:
        response = self.request('POST', f'/lessons/{self.lesson_ids[0]}/complete', self.free_id)
        self.assertEqual(response.status_code, 403)

    def test_admin_lesson_add_and_delete_recompute_student_progress(self) -> None:
        for lesson_id in self.lesson_ids:
            completed = self.request('POST', f'/lessons/{lesson_id}/complete', self.paid_id)
            self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()['progress']['percent'], 100)

        added = self.loop.run_until_complete(
            self.client.post(
                f'/admin/modules/{self.module_id}/lessons',
                headers=self.headers(self.admin_id),
                json={'title': 'B3 Added Lesson', 'body_html': '<p>New</p>', 'duration_minutes': 15, 'order': 4},
            )
        )
        self.assertEqual(added.status_code, 201, added.text)
        lesson_id = uuid.UUID(added.json()['id'])

        async def stored_progress() -> tuple[int, int, int]:
            async with AsyncSessionLocal() as session:
                progress = await session.scalar(
                    select(CourseProgress).where(CourseProgress.user_id == self.paid_id, CourseProgress.course_id == self.course_id)
                )
                return progress.completed_count, progress.total_count, progress.percent

        self.assertEqual(self.loop.run_until_complete(stored_progress()), (3, 4, 75))
        detail = self.request('GET', f'/courses/{self.course_id}', self.paid_id)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()['progress']['percent'], 75)
        self.assertEqual(detail.json()['modules'][0]['lessons'][-1]['title'], 'B3 Added Lesson')

        deleted = self.loop.run_until_complete(
            self.client.delete(
                f'/admin/modules/{self.module_id}/lessons/{lesson_id}',
                headers=self.headers(self.admin_id),
                params={'confirm_progress_loss': 'true', 'confirm_title': 'B3 Added Lesson'},
            )
        )
        self.assertEqual(deleted.status_code, 204, deleted.text)
        self.assertEqual(self.loop.run_until_complete(stored_progress()), (3, 3, 100))
