from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.urls import validate_http_url

from app.models.gsp_models import AccessType


class MasterclassUrls(BaseModel):
    @field_validator('session_link', 'recording_url', check_fields=False)
    @classmethod
    def validate_external_url(cls, value, info):
        result = validate_http_url(value)
        if info.field_name == 'session_link' and result is None:
            raise ValueError('Enter a valid http or https session link')
        return result


class MasterclassWrite(MasterclassUrls):
    title: str = Field(min_length=1, max_length=255)
    speaker_name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    session_datetime: datetime
    session_link: str = Field(min_length=1, max_length=500)
    access_type: AccessType
    recording_url: str | None = Field(default=None, max_length=500)


class MasterclassPatch(MasterclassUrls):
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    speaker_name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    session_datetime: datetime | None = None
    session_link: str | None = Field(default=None, min_length=1, max_length=500)
    access_type: AccessType | None = None
    recording_url: str | None = Field(default=None, max_length=500)


class MasterclassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    speaker_name: str
    description: str | None
    session_datetime: datetime
    session_link: str | None
    access_type: AccessType
    recording_url: str | None
    is_past: bool
    locked: bool
