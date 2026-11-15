from datetime import datetime
from typing import Literal
from uuid import UUID
from urllib.parse import urlsplit

import bleach
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.gsp_models import AccessType, CourseStatus, ResourceStatus
from app.core.content import sanitize_html, sanitize_lesson_html
from app.schemas.urls import validate_http_url


class SanitizedContentFields(BaseModel):
    @field_validator('url', 'external_link', check_fields=False)
    @classmethod
    def validate_external_url(cls, value):
        return validate_http_url(value)

    @field_validator('description', 'summary', check_fields=False)
    @classmethod
    def sanitize_content_fields(cls, value, info):
        if value is None:
            return None
        cleaned = sanitize_html(value)
        # Escaping must not overflow an existing field/storage length constraint.
        for constraint in cls.model_fields[info.field_name].metadata:
            maximum = getattr(constraint, 'max_length', None)
            if maximum is not None and len(cleaned) > maximum:
                raise ValueError('Sanitized text exceeds the field length limit')
        return cleaned


class SanitizedLessonFields(BaseModel):
    @field_validator('body_html', check_fields=False)
    @classmethod
    def sanitize_response_body(cls, value):
        return sanitize_lesson_html(value, validate_images=False)


class CourseWrite(SanitizedContentFields):
    title: str = Field(min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    learning_outcomes: list[str] = Field(default_factory=list, max_length=8)
    access_type: AccessType
    status: CourseStatus = CourseStatus.draft

    @field_validator('learning_outcomes')
    @classmethod
    def validate_learning_outcomes(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 120 for value in cleaned):
            raise ValueError('Learning outcomes must be 1 to 120 characters')
        if len({value.casefold() for value in cleaned}) != len(cleaned):
            raise ValueError('Learning outcomes must be unique')
        return cleaned


class CoursePatch(SanitizedContentFields):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    learning_outcomes: list[str] | None = Field(default=None, max_length=8)
    access_type: AccessType | None = None
    status: CourseStatus | None = None
    expected_updated_at: datetime | None = None

    @field_validator('title', 'access_type', 'status', 'learning_outcomes', mode='before')
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError('Field cannot be null')
        return value

    @field_validator('learning_outcomes')
    @classmethod
    def validate_learning_outcomes(cls, values: list[str]) -> list[str]:
        return CourseWrite.validate_learning_outcomes(values)


class ModuleWrite(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    order: int = Field(ge=0)


class ModulePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    order: int | None = Field(default=None, ge=0)
    expected_updated_at: datetime | None = None

    @field_validator('title', 'order', mode='before')
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError('Field cannot be null')
        return value


class LessonResource(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=500)

    @field_validator('title', mode='before')
    @classmethod
    def clean_title(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError('Resource title must be text')
        cleaned = bleach.clean(value.strip(), tags=[], strip=True).strip()
        if not cleaned or len(cleaned) > 80:
            raise ValueError('Resource title must be 1 to 80 characters')
        return cleaned

    @field_validator('url')
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        try:
            parsed = urlsplit(value)
        except ValueError as error:
            raise ValueError('Resource URL must use http or https') from error
        if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Resource URL must use http or https')
        return value


class LessonWrite(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body_html: str
    try_it_yourself_prompt: str | None = None
    duration_minutes: int = Field(default=0, ge=0, le=600)
    order: int = Field(ge=0)


class LessonPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    body_html: str | None = None
    try_it_yourself_prompt: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=600)
    video_url: str | None = Field(default=None, max_length=500)
    resources: list['LessonResource'] | None = Field(default=None, max_length=10)
    order: int | None = Field(default=None, ge=0)
    expected_updated_at: datetime | None = None

    @field_validator('title', 'body_html', 'order', 'duration_minutes', mode='before')
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError('Field cannot be null')
        return value

    @field_validator('resources')
    @classmethod
    def validate_resources(cls, values: list['LessonResource'] | None) -> list['LessonResource'] | None:
        if values is None:
            raise ValueError('Resources cannot be null; use an empty list to clear them')
        urls = [resource.url.casefold() for resource in values]
        if len(urls) != len(set(urls)):
            raise ValueError('Resource URLs must be unique')
        return values


class LessonVideoResponse(BaseModel):
    provider: Literal['youtube', 'vimeo']
    id: str


class LessonResponse(SanitizedLessonFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    body_html: str
    try_it_yourself_prompt: str | None
    duration_minutes: int = 0
    video: LessonVideoResponse | None = None
    resources: list[LessonResource] = Field(default_factory=list)
    order: int
    updated_at: datetime | None = None
    completed: bool = False

    @model_validator(mode='before')
    @classmethod
    def shape_video(cls, value):
        data = dict(value) if isinstance(value, dict) else {
            field: getattr(value, field)
            for field in (
                'id', 'title', 'body_html', 'try_it_yourself_prompt', 'duration_minutes',
                'resources', 'order', 'updated_at', 'completed', 'video_provider', 'video_id',
            )
            if hasattr(value, field)
        }
        if 'video' not in data:
            provider = data.pop('video_provider', None)
            video_id = data.pop('video_id', None)
            data['video'] = {'provider': provider, 'id': video_id} if provider and video_id else None
        return data


class CourseProgressResponse(BaseModel):
    completed_count: int
    total_count: int
    percent: int


class ModuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    order: int
    updated_at: datetime | None = None
    lessons: list[LessonResponse]


class CourseSummaryResponse(SanitizedContentFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    summary: str | None = None
    description: str | None
    thumbnail_url: str | None = None
    learning_outcomes: list[str] = Field(default_factory=list)
    access_type: AccessType
    locked: bool
    module_count: int
    lesson_count: int = 0
    duration_minutes: int = 0
    structure_revision: int = 1
    updated_at: datetime | None = None
    progress: CourseProgressResponse | None = None


class CourseDetailResponse(SanitizedContentFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    summary: str | None = None
    description: str | None
    thumbnail_url: str | None = None
    learning_outcomes: list[str] = Field(default_factory=list)
    access_type: AccessType
    status: CourseStatus
    module_count: int = 0
    lesson_count: int = 0
    duration_minutes: int = 0
    structure_revision: int = 1
    updated_at: datetime | None = None
    modules: list[ModuleResponse]
    progress: CourseProgressResponse


class LessonCompletionResponse(BaseModel):
    lesson_id: UUID
    completed: bool
    progress: CourseProgressResponse


class ResourceWrite(SanitizedContentFields):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str = Field(min_length=1, max_length=100)
    access_type: AccessType
    url: str | None = Field(default=None, max_length=500)
    status: ResourceStatus


class ResourcePatch(SanitizedContentFields):
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, min_length=1, max_length=100)
    access_type: AccessType | None = None
    url: str | None = Field(default=None, max_length=500)
    status: ResourceStatus | None = None


class ResourceResponse(SanitizedContentFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    category: str
    access_type: AccessType
    url: str | None
    status: ResourceStatus
    locked: bool = False


class OpportunityWrite(SanitizedContentFields):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str = Field(min_length=1, max_length=100)
    deadline: datetime | None = None
    external_link: str | None = Field(default=None, max_length=500)


class OpportunityPatch(SanitizedContentFields):
    expected_updated_at: datetime | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, min_length=1, max_length=100)
    deadline: datetime | None = None
    external_link: str | None = Field(default=None, max_length=500)


class OpportunityResponse(SanitizedContentFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    category: str
    deadline: datetime | None
    external_link: str | None
    status: Literal['Open', 'Expiring Soon', 'Expired']
    locked: bool = False
