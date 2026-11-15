from __future__ import annotations

import asyncio
import io
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import BinaryIO, Protocol

from fastapi import UploadFile

MAX_UPLOAD_SIZE = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
}


class StorageBackend(Protocol):
    async def save(
        self,
        file: UploadFile,
        *,
        max_size: int | None = None,
        allowed_types: set[str] | None = None,
        prefix: str = '',
    ) -> str: ...

    async def open(self, storage_key: str) -> BinaryIO: ...

    async def open_public(self, filename: str) -> BinaryIO: ...

    async def save_bytes(self, storage_key: str, content: bytes) -> None: ...

    async def delete(self, storage_key: str) -> None: ...


class UploadValidationError(ValueError):
    pass


class LocalStorageBackend:
    """DEV-only storage; replace with S3-compatible private storage later."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(os.environ.get('GSP_UPLOAD_DIR', str(Path(__file__).resolve().parents[2] / 'uploads')))
        self.root.mkdir(parents=True, exist_ok=True)

    async def save(
        self,
        file: UploadFile,
        *,
        max_size: int | None = None,
        allowed_types: set[str] | None = None,
        prefix: str = '',
    ) -> str:
        limit = max_size or MAX_UPLOAD_SIZE
        allowed = allowed_types or ALLOWED_CONTENT_TYPES

        content = await file.read(limit + 1)
        if len(content) > limit:
            limit_display = f'{limit / (1024 * 1024):.0f}MB' if limit >= 1024 * 1024 else f'{limit / 1024:.0f}KB'
            raise UploadValidationError(f'Uploaded file exceeds the {limit_display} limit')

        actual_type = sniff_content_type(content)
        if actual_type not in allowed:
            raise UploadValidationError('Uploaded file type is not allowed')

        if actual_type in {'image/jpeg', 'image/png', 'image/webp'}:
            # Private scanned-image documents use the same privacy boundary as media.
            from app.core.images import process_image
            processed = await asyncio.to_thread(process_image, content, 'public')
            content = processed.content

        storage_key = f'{uuid.uuid4()}{extension_for_type(actual_type)}'
        if prefix:
            if not re.fullmatch(r'[a-z0-9_-]+', prefix):
                raise ValueError('Invalid storage prefix')
            storage_key = f'{prefix}/{storage_key}'
        await self.save_bytes(storage_key, content)
        return storage_key

    async def open(self, storage_key: str) -> BinaryIO:
        path = self._resolve(storage_key)
        if not path.is_file():
            raise FileNotFoundError(storage_key)
        content = await asyncio.to_thread(path.read_bytes)
        return io.BytesIO(content)

    async def open_public(self, filename: str) -> BinaryIO:
        if not re.fullmatch(r'[0-9a-f-]{36}(-(640|960|1280|1920))?\.(jpg|png|webp)', filename):
            raise FileNotFoundError(filename)
        return await self.open(f'public/{filename}')

    async def save_bytes(self, storage_key: str, content: bytes) -> None:
        destination = self._resolve(storage_key)
        def write_atomic():
            destination.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(prefix='.upload-', dir=destination.parent)
            try:
                with os.fdopen(descriptor, 'wb') as output:
                    output.write(content)
                os.replace(temporary, destination)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        task = asyncio.create_task(asyncio.to_thread(write_atomic))
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            # Finish the write before the caller removes its generated keys.
            await task
            raise

    async def delete(self, storage_key: str) -> None:
        path = self._resolve(storage_key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    def _resolve(self, storage_key: str) -> Path:
        path = (self.root / storage_key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError('Invalid storage key')
        return path


def sniff_content_type(content: bytes) -> str | None:
    if content.startswith(b'%PDF-'):
        return 'application/pdf'
    if content.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
        return 'application/msword'
    if content.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if content.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if len(content) >= 12 and content.startswith(b'RIFF') and content[8:12] == b'WEBP':
        return 'image/webp'
    if content.startswith(b'PK\x03\x04'):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                if '[Content_Types].xml' in archive.namelist() and 'word/document.xml' in archive.namelist():
                    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        except zipfile.BadZipFile:
            return None
    return None


def extension_for_type(content_type: str) -> str:
    return {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
    }[content_type]


storage_backend: StorageBackend = LocalStorageBackend()
