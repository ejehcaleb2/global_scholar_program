"""One decoding/re-encoding boundary for every user-uploaded image."""
import asyncio
import io
import uuid
import warnings
from dataclasses import dataclass
from typing import Literal

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.storage import StorageBackend, extension_for_type, sniff_content_type

Image.MAX_IMAGE_PIXELS = 40_000_000
MAX_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP'}


class ImageValidationError(ValueError):
    def __init__(self, code: str, message: str, *, status_code: int = 422, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details or {}


@dataclass(frozen=True)
class ProcessedImage:
    content: bytes
    content_type: str
    width: int
    height: int
    thumbnail: bytes | None = None


def _encode(image: Image.Image, image_format: str) -> bytes:
    # A fresh pixel-only image prevents plugins from carrying source metadata forward.
    clean = Image.frombytes('RGB', image.size, image.tobytes())
    output = io.BytesIO()
    options = {'quality': 85} if image_format in {'JPEG', 'WEBP'} else {'optimize': True}
    clean.save(output, format=image_format, **options)
    return output.getvalue()


def process_image(content: bytes, profile: Literal['avatar', 'public']) -> ProcessedImage:
    if not content:
        raise ImageValidationError('image_empty', 'The image is empty.')
    if len(content) > MAX_BYTES:
        raise ImageValidationError('image_size', 'The image exceeds the 5 MB limit.', status_code=413)
    content_type = sniff_content_type(content)
    if content_type not in IMAGE_TYPES:
        raise ImageValidationError('image_type', 'Use a JPEG, PNG or WebP image.', status_code=415)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as probe:
                if probe.format != IMAGE_TYPES[content_type]:
                    raise ImageValidationError('image_type', 'The image content and format do not match.')
                if getattr(probe, 'is_animated', False) or getattr(probe, 'n_frames', 1) != 1:
                    raise ImageValidationError('image_animated', 'Animated images are not supported.')
                if probe.width * probe.height > Image.MAX_IMAGE_PIXELS:
                    raise ImageValidationError('image_pixels', 'The image exceeds the 40,000,000 pixel limit.')
                probe.verify()
            with Image.open(io.BytesIO(content)) as source:
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.load()
        if profile == 'avatar':
            width, height = image.size
            if min(width, height) < 128:
                raise ImageValidationError('image_dimensions', f'The image is {width} by {height} pixels; an avatar requires at least 128 by 128 pixels.', details={'width': width, 'height': height, 'minimum': 128})
            side = min(width, height)
            left, top = (width - side) // 2, (height - side) // 2
            square = image.crop((left, top, left + side, top + side))
            size = min(512, side)
            full = square.resize((size, size), Image.Resampling.LANCZOS)
            small = square.resize((96, 96), Image.Resampling.LANCZOS)
            return ProcessedImage(_encode(full, 'WEBP'), 'image/webp', size, size, _encode(small, 'WEBP'))
        if profile != 'public':
            raise ValueError('Unknown image profile')
        image.thumbnail((3000, 3000), Image.Resampling.LANCZOS)
        return ProcessedImage(_encode(image, IMAGE_TYPES[content_type]), content_type, *image.size)
    except ImageValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageValidationError('image_pixels', 'The image exceeds the 40,000,000 pixel limit.') from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, EOFError) as exc:
        raise ImageValidationError('image_invalid', 'The image could not be decoded. Choose a valid image.') from exc


async def prepare_upload(file: UploadFile, profile: Literal['avatar', 'public']) -> ProcessedImage:
    content = await file.read(MAX_BYTES + 1)
    return await asyncio.to_thread(process_image, content, profile)


def thumbnail_key(storage_key: str) -> str:
    return storage_key.rsplit('.', 1)[0] + '-96.webp'


async def store_image(storage: StorageBackend, image: ProcessedImage, *, public: bool = False) -> str:
    key = ('public/' if public else '') + str(uuid.uuid4()) + extension_for_type(image.content_type)
    keys = [key] + ([thumbnail_key(key)] if image.thumbnail is not None else [])
    try:
        await storage.save_bytes(key, image.content)
        if image.thumbnail is not None:
            await storage.save_bytes(keys[1], image.thumbnail)
        return key
    except BaseException:
        for candidate in keys:
            await storage.delete(candidate)
        raise


async def delete_avatar(storage: StorageBackend, key: str) -> None:
    await storage.delete(key)
    await storage.delete(thumbnail_key(key))
