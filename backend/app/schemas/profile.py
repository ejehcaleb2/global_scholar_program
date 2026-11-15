from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.gsp_models import EducationLevel, SubscriptionPlan, SubscriptionStatus
from app.schemas.auth import TokenResponse


class PasswordChangeResponse(BaseModel):
    status: Literal['ok'] = 'ok'
    tokens: TokenResponse


class MembershipResponse(BaseModel):
    tier: Literal['free', 'paid']
    plan: SubscriptionPlan | None
    status: SubscriptionStatus | None
    current_period_end: datetime | None


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    full_name: str | None
    phone: str | None
    date_of_birth: date | None
    country: str | None
    avatar_url: str | None
    updated_at: datetime
    education_level: EducationLevel | None
    school: str | None
    city: str | None
    what_brings_you: list[str] | None
    fields_of_study: list[str] | None
    countries_of_interest: list[str] | None


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra='forbid')

    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    date_of_birth: date | None = None
    country: str | None = Field(default=None, max_length=255)
    education_level: EducationLevel | None = None
    school: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=255)
    what_brings_you: list[str] | None = None
    fields_of_study: list[str] | None = None
    countries_of_interest: list[str] | None = None


class EmailChangeRequest(BaseModel):
    @field_validator('new_email', mode='before')
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    model_config = ConfigDict(extra='forbid')

    current_password: str = Field(min_length=1, max_length=128)
    new_email: str = Field(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class PasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str


class AvatarUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    avatar_url: str | None
    updated_at: datetime
