import re
from datetime import datetime
from uuid import UUID
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.gsp_models import HomepageStatus
from app.core.content import sanitize_html, parse_lesson_video_url
from app.schemas.urls import validate_http_url


class TextSection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    type: Literal['text']
    body_html: str = Field(max_length=200000)

    @field_validator('body_html')
    @classmethod
    def clean_body(cls, value):
        cleaned = sanitize_html(value)
        if not re.sub(r'<[^>]*>|&nbsp;|&#160;', '', cleaned).strip():
            raise ValueError('Text sections must contain text')
        return cleaned


class ImageSection(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    id: UUID
    type: Literal['image']
    url: str = Field(min_length=1, max_length=500)
    alt: str = Field(min_length=1, max_length=300)
    caption: str = Field(default='', max_length=1000)

    @field_validator('url')
    @classmethod
    def safe_url(cls, value):
        return validate_http_url(value)


class VideoSection(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    id: UUID
    type: Literal['video']
    url: str = Field(min_length=1, max_length=500)
    caption: str = Field(default='', max_length=1000)

    @field_validator('url')
    @classmethod
    def safe_video(cls, value):
        provider, video_id = parse_lesson_video_url(value)
        return f'https://www.youtube.com/watch?v={video_id}' if provider == 'youtube' else f'https://vimeo.com/{video_id}'


PostSection = Annotated[TextSection | ImageSection | VideoSection, Field(discriminator='type')]


class PublicationSections(BaseModel):
    sections: list[PostSection] = Field(default_factory=list, max_length=50)

    @field_validator('sections')
    @classmethod
    def unique_sections(cls, values):
        if len({item.id for item in values}) != len(values):
            raise ValueError('Publication section identifiers must be unique')
        return values



class HomepagePostWrite(PublicationSections):
    title: str = Field(min_length=1, max_length=255)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    summary: str | None = None
    body_html: str
    status: HomepageStatus
    pinned: bool = False
    pin_order: int | None = Field(default=None, ge=1, le=3)

    @model_validator(mode='after')
    def validate_pin_state(self):
        if self.pinned and self.status != HomepageStatus.published:
            raise ValueError('A draft homepage post cannot be pinned')
        return self


class HomepagePostPatch(BaseModel):
    sections: list[PostSection] = Field(default_factory=list, max_length=50)
    _unique_sections = field_validator('sections')(PublicationSections.unique_sections.__func__)
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    summary: str | None = None
    body_html: str | None = None
    status: HomepageStatus | None = None
    pinned: bool | None = None
    pin_order: int | None = Field(default=None, ge=1, le=3)


class HomepagePostResponse(PublicationSections):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    thumbnail_url: str | None
    summary: str | None
    body_html: str
    status: HomepageStatus
    pinned: bool
    pin_order: int | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
