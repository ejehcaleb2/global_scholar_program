from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.gsp_models import HomepageStatus


class HomepagePostWrite(BaseModel):
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
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    summary: str | None = None
    body_html: str | None = None
    status: HomepageStatus | None = None
    pinned: bool | None = None
    pin_order: int | None = Field(default=None, ge=1, le=3)


class HomepagePostResponse(BaseModel):
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
