import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlsplit
from uuid import UUID

import bleach
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.gsp_models import AuditLog

ALLOWED_HTML_TAGS = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre']
ALLOWED_HTML_ATTRIBUTES = {'a': ['href', 'title', 'target', 'rel']}

AUDIT_ACTIONS = {
    'created': 'created',
    'updated': 'updated',
    'deleted': 'deleted',
    'published': 'published',
    'unpublished': 'unpublished',
    'pinned': 'pinned',
    'unpinned': 'unpinned',
    'reordered': 'reordered',
    'uploaded': 'uploaded',
    'status_changed': 'status_changed',
    'exported': 'exported',
}

SECRET_KEYS = {'password', 'hashed_password', 'token', 'access_token', 'refresh_token', 'secret', 'api_key', 'authorization'}
LONG_TEXT_FIELDS = {'body_html', 'description', 'body', 'lesson_body', 'content'}


def _prune_change_value(field_name: str, value):
    if field_name.lower() in SECRET_KEYS:
        return None
    if value is None:
        return None
    if isinstance(value, str):
        if field_name.lower() in LONG_TEXT_FIELDS or len(value) > 400:
            return {'changed': True}
        return value
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, (list, dict)):
        return value
    return str(value)


def _coerce_changes(changes: dict | None) -> dict | None:
    if not changes:
        return None
    pruned = {}
    for field_name, value in changes.items():
        if field_name.lower() in SECRET_KEYS:
            continue
        if field_name.lower() in LONG_TEXT_FIELDS:
            pruned[field_name] = {'changed': True}
            continue
        if isinstance(value, dict) and 'from' in value and 'to' in value:
            old_value = _prune_change_value(field_name, value.get('from'))
            new_value = _prune_change_value(field_name, value.get('to'))
            if old_value is None and new_value is None:
                continue
            pruned[field_name] = {'from': old_value, 'to': new_value}
        else:
            old_value = _prune_change_value(field_name, value)
            if old_value is not None:
                pruned[field_name] = {'from': None, 'to': old_value}
    if not pruned:
        return None
    payload = json.dumps(pruned, default=str, separators=(',', ':'))
    if len(payload) > 4096:
        return {'truncated': True}
    return pruned


def _build_audit_extra_data(label: str | None = None, changes: dict | None = None) -> dict | None:
    extra_data = {}
    if label is not None:
        extra_data['label'] = label
    if changes is not None:
        extra_data['changes'] = _coerce_changes(changes)
    if not extra_data:
        return None
    payload = json.dumps(extra_data, default=str, separators=(',', ':'))
    if len(payload) > 4096:
        extra_data['changes'] = {'truncated': True}
        payload = json.dumps(extra_data, default=str, separators=(',', ':'))
        if len(payload) > 4096:
            extra_data = {'label': label[:200] if label else 'audit_log', 'changes': {'truncated': True}}
    return extra_data


def sanitize_html(value: str) -> str:
    return bleach.clean(value, tags=ALLOWED_HTML_TAGS, attributes=ALLOWED_HTML_ATTRIBUTES, protocols=['http', 'https', 'mailto'])


class _LessonImageAltParser(HTMLParser):
    has_missing_alt = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == 'img':
            alt = next((value for name, value in attrs if name.lower() == 'alt'), None)
            if not alt or not alt.strip():
                self.has_missing_alt = True


def _is_public_media_url(value: str) -> bool:
    try:
        candidate = urlsplit(value)
        configured = urlsplit(get_settings().API_BASE_URL)
        return (
            candidate.scheme in {'http', 'https'}
            and candidate.netloc == configured.netloc
            and re.fullmatch(r'/media/public/[0-9a-f-]{36}\.(?:jpg|png|webp)', candidate.path) is not None
        )
    except ValueError:
        return False


def sanitize_lesson_html(value: str, *, validate_images: bool = True) -> str:
    if validate_images:
        parser = _LessonImageAltParser()
        parser.feed(value)
        if parser.has_missing_alt:
            raise ValueError('Every lesson image must have alternative text')

    def attributes(tag: str, name: str, attribute_value: str) -> bool:
        if tag == 'a':
            return name in ALLOWED_HTML_ATTRIBUTES['a']
        if tag == 'img':
            if name == 'src':
                return _is_public_media_url(attribute_value)
            return name == 'alt' and bool(attribute_value.strip())
        return False

    return bleach.clean(
        value,
        tags=[*ALLOWED_HTML_TAGS, 'img'],
        attributes=attributes,
        protocols=['http', 'https', 'mailto'],
    )


def parse_lesson_video_url(value: str) -> tuple[str, str]:
    try:
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError
    except ValueError as error:
        raise ValueError('Use a supported HTTPS YouTube or Vimeo video URL') from error

    host = (parsed.hostname or '').lower()
    host = {'www.youtube.com': 'youtube.com', 'www.vimeo.com': 'vimeo.com', 'www.youtube-nocookie.com': 'youtube-nocookie.com'}.get(host, host)
    segments = [segment for segment in parsed.path.split('/') if segment]
    video_id = None
    provider = None
    if host == 'youtube.com':
        provider = 'youtube'
        if parsed.path == '/watch':
            video_id = next((item for key, item in parse_qsl(parsed.query) if key == 'v'), None)
        elif len(segments) == 2 and segments[0] in {'embed', 'shorts'}:
            video_id = segments[1]
        if video_id is None or re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id) is None:
            raise ValueError('Use a supported HTTPS YouTube or Vimeo video URL')
    elif (host == 'youtu.be' and len(segments) == 1) or (host == 'youtube-nocookie.com' and len(segments) == 2 and segments[0] == 'embed'):
        provider = 'youtube'
        video_id = segments[-1]
        if re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id) is None:
            raise ValueError('Use a supported HTTPS YouTube or Vimeo video URL')
    elif host == 'vimeo.com' and len(segments) == 1:
        provider = 'vimeo'
        video_id = segments[0]
        if re.fullmatch(r'[0-9]{1,64}', video_id) is None:
            raise ValueError('Use a supported HTTPS YouTube or Vimeo video URL')
    else:
        raise ValueError('Use a supported HTTPS YouTube or Vimeo video URL')
    return provider, video_id


def opportunity_status(deadline: datetime | None) -> str:
    if deadline is None:
        return 'Open'

    now = datetime.now(timezone.utc)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    remaining = deadline - now
    if remaining.total_seconds() < 0:
        return 'Expired'
    if remaining.total_seconds() <= 7 * 24 * 60 * 60:
        return 'Expiring Soon'
    return 'Open'


def audit_field_changes(entity, values: dict) -> dict:
    return {field: {'from': getattr(entity, field), 'to': value}
            for field, value in values.items() if getattr(entity, field) != value}


async def write_audit_log(
    db: AsyncSession,
    actor_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID,
    label: str | None = None,
    changes: dict | None = None,
    affected_ids: list[UUID] | None = None,
) -> None:
    if changes is None and action in {'created', 'deleted', 'upload'}:
        changes = {'id': {'from': str(entity_id) if action == 'deleted' else None,
                          'to': None if action == 'deleted' else str(entity_id)}}
    extra_data = _build_audit_extra_data(label=label, changes=changes)
    # Server-derived identifiers must survive the long-text change summary cap.
    extra_data = {**(extra_data or {}), 'affected_ids': [str(value) for value in (affected_ids if affected_ids is not None else [entity_id])]}
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            extra_data=extra_data,
        )
    )
