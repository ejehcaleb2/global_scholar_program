from tests import configure_test_environment, credential

configure_test_environment()

import io
from PIL import Image
from tests.media.test_images import image_bytes
from app.core.images import delete_avatar
import asyncio
import uuid
from unittest import TestCase

import httpx
from sqlalchemy import delete, select

from app.core.security import create_access_token, get_password_hash, verify_password
from app.core.storage import storage_backend
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.gsp_models import Profile, User


class ProfileTests(TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(cls.loop)
        cls.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')

    @classmethod
    def tearDownClass(cls) -> None:
        cls.loop.run_until_complete(cls.client.aclose())
        cls.loop.run_until_complete(AsyncSessionLocal.kw['bind'].dispose())
        cls.loop.close()

    def setUp(self) -> None:
        self.user_id = uuid.uuid4()
        self.other_user_id = uuid.uuid4()
        self.password = credential()
        self.avatar_keys: list[str] = []
        self.loop.run_until_complete(self._create_users())

    def tearDown(self) -> None:
        self.loop.run_until_complete(self._cleanup())

    async def _create_users(self) -> None:
        async with AsyncSessionLocal() as session:
            session.add_all([
                User(id=self.user_id, email=f'{self.user_id}@profile.test', hashed_password=get_password_hash(self.password)),
                User(id=self.other_user_id, email=f'{self.other_user_id}@profile.test', hashed_password=get_password_hash(self.password)),
            ])
            await session.flush()
            session.add_all([
                Profile(user_id=self.user_id),
                Profile(user_id=self.other_user_id),
            ])
            await session.commit()

    async def _cleanup(self) -> None:
        for storage_key in self.avatar_keys:
            await delete_avatar(storage_backend, storage_key)
        async with AsyncSessionLocal() as session:
            await session.execute(delete(User).where(User.id.in_([self.user_id, self.other_user_id])))
            await session.commit()

    def headers(self, user_id: uuid.UUID) -> dict[str, str]:
        return {'Authorization': f'Bearer {create_access_token(str(user_id))}'}

    def test_patch_profile_updates_own_row_and_get_returns_it(self) -> None:
        response = self.loop.run_until_complete(self.client.patch(
            '/profile',
            headers=self.headers(self.user_id),
            json={
                'education_level': 'undergraduate',
                'school': 'University of Yaounde',
                'city': 'Yaounde',
                'what_brings_you': ['scholarships'],
                'fields_of_study': ['Computer Science'],
                'countries_of_interest': ['Canada'],
            },
        ))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['school'], 'University of Yaounde')

        fetched = self.loop.run_until_complete(self.client.get('/profile', headers=self.headers(self.user_id)))
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()['education_level'], 'undergraduate')

        async def query_row() -> Profile:
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(Profile).where(Profile.user_id == self.user_id))

        row = self.loop.run_until_complete(query_row())
        self.assertEqual(row.city, 'Yaounde')
        self.assertEqual(row.what_brings_you, ['scholarships'])

    def test_profile_update_uses_token_user_and_cannot_target_another_user(self) -> None:
        response = self.loop.run_until_complete(self.client.patch(
            '/profile',
            headers=self.headers(self.user_id),
            json={'school': 'Only My School', 'user_id': str(self.other_user_id)},
        ))
        self.assertEqual(response.status_code, 422)

        async def query_other_row() -> Profile:
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(Profile).where(Profile.user_id == self.other_user_id))

        other_row = self.loop.run_until_complete(query_other_row())
        self.assertIsNone(other_row.school)

    def test_profile_patch_cannot_set_avatar_storage_key_directly(self) -> None:
        response = self.loop.run_until_complete(self.client.patch(
            '/profile',
            headers=self.headers(self.user_id),
            json={'avatar_url': 'another-user/private.png'},
        ))
        self.assertEqual(response.status_code, 422)

    def test_email_change_rejects_wrong_password_and_duplicate_email(self) -> None:
        wrong_password = self.loop.run_until_complete(self.client.post(
            '/profile/email',
            headers=self.headers(self.user_id),
            json={'current_password': credential('GSP_TEST_INVALID_PASSWORD'), 'new_email': 'new@example.com'},
        ))
        self.assertEqual(wrong_password.status_code, 401)

        duplicate = self.loop.run_until_complete(self.client.post(
            '/profile/email',
            headers=self.headers(self.user_id),
            json={'current_password': self.password, 'new_email': f'{self.other_user_id}@profile.test'},
        ))
        self.assertEqual(duplicate.status_code, 409)

        success = self.loop.run_until_complete(self.client.post(
            '/profile/email',
            headers=self.headers(self.user_id),
            json={'current_password': self.password, 'new_email': 'updated@example.com'},
        ))
        self.assertEqual(success.status_code, 200)
        self.assertEqual(success.json()['user_id'], str(self.user_id))

        async def query_updated_user() -> User:
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(User).where(User.id == self.user_id))

        user = self.loop.run_until_complete(query_updated_user())
        self.assertEqual(user.email, 'updated@example.com')

    def test_avatar_upload_rejects_invalid_type_and_oversized_file(self) -> None:
        invalid = self.loop.run_until_complete(self.client.post(
            '/profile/avatar',
            headers=self.headers(self.user_id),
            files={'file': ('fake.png', b'not an image', 'image/png')},
        ))
        self.assertEqual(invalid.status_code, 415)

        oversized = b'\x89PNG\r\n\x1a\n' + b'0' * (6 * 1024 * 1024)
        oversized_response = self.loop.run_until_complete(self.client.post(
            '/profile/avatar',
            headers=self.headers(self.user_id),
            files={'file': ('oversized.png', oversized, 'image/png')},
        ))
        self.assertEqual(oversized_response.status_code, 413)

    def test_avatar_upload_persists_and_is_readable_only_by_owner_or_admin(self) -> None:
        image = image_bytes((640, 320), 'PNG')
        uploaded = self.loop.run_until_complete(self.client.post(
            '/profile/avatar',
            headers=self.headers(self.user_id),
            files={'file': ('profile.png', image, 'image/png')},
        ))
        self.assertEqual(uploaded.status_code, 200)
        storage_key = uploaded.json()['avatar_url']
        self.assertTrue(storage_key.endswith('.webp'))
        self.avatar_keys.append(storage_key)

        async def query_profile() -> Profile:
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(Profile).where(Profile.user_id == self.user_id))

        profile = self.loop.run_until_complete(query_profile())
        self.assertEqual(profile.avatar_url, storage_key)

        downloaded = self.loop.run_until_complete(self.client.get(
            f'/profile/avatar/{self.user_id}',
            headers=self.headers(self.user_id),
        ))
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.headers['content-type'], 'image/webp')
        self.assertEqual(downloaded.headers['cache-control'], 'private, max-age=300')
        self.assertEqual(downloaded.headers['vary'], 'Authorization')
        with Image.open(io.BytesIO(downloaded.content)) as decoded:
            self.assertEqual(decoded.size, (320, 320))
            self.assertEqual(dict(decoded.getexif()), {})

        denied = self.loop.run_until_complete(self.client.get(
            f'/profile/avatar/{self.user_id}',
            headers=self.headers(self.other_user_id),
        ))
        self.assertEqual(denied.status_code, 404)

    def test_password_change_requires_current_password_and_persists_hash(self) -> None:
        password_change = self.loop.run_until_complete(self.client.post(
            '/profile/password',
            headers=self.headers(self.user_id),
            json={'current_password': credential('GSP_TEST_INVALID_PASSWORD'), 'new_password': credential('GSP_TEST_NEW_PASSWORD')},
        ))
        self.assertEqual(password_change.status_code, 401)

        password_change = self.loop.run_until_complete(self.client.post(
            '/profile/password',
            headers=self.headers(self.user_id),
            json={'current_password': self.password, 'new_password': credential('GSP_TEST_NEW_PASSWORD')},
        ))
        self.assertEqual(password_change.status_code, 200)

        async def query_user() -> User:
            async with AsyncSessionLocal() as session:
                return await session.scalar(select(User).where(User.id == self.user_id))

        user = self.loop.run_until_complete(query_user())
        self.assertTrue(verify_password(credential('GSP_TEST_NEW_PASSWORD'), user.hashed_password))


if __name__ == '__main__':
    unittest.main()