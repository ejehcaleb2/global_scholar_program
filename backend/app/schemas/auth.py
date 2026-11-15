from datetime import date
import json
import re
import unicodedata
from pathlib import Path
from pydantic_core import PydanticCustomError
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.gsp_models import UserRole

COUNTRIES = {item['name'] for item in json.loads((Path(__file__).parents[1] / 'core/countries.json').read_text(encoding='utf-8'))}


class SignupRequest(BaseModel):
    @field_validator('email', mode='before')
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    model_config = ConfigDict(extra='forbid')

    email: str = Field(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    password: str
    full_name: str
    phone: str | None = None
    date_of_birth: date
    country: str
    accept_terms: bool = Field(default=False, validate_default=True)
    accept_privacy: bool = Field(default=False, validate_default=True)

    @field_validator('accept_terms', 'accept_privacy', mode='before')
    @classmethod
    def required_consent(cls, value):
        if value is not True:
            raise PydanticCustomError('consent_required', 'consent_required')
        return value

    @field_validator('full_name')
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = ''.join(char for char in value if unicodedata.category(char) != 'Cc').strip()
        if not 1 <= len(value) <= 120:
            raise PydanticCustomError('name_invalid', 'name_invalid')
        return value

    @field_validator('date_of_birth')
    @classmethod
    def valid_age(cls, value: date) -> date:
        today = date.today()
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if value > today or not 10 <= age <= 100:
            raise PydanticCustomError('birth_date_invalid', 'birth_date_invalid')
        return value

    @field_validator('country')
    @classmethod
    def valid_country(cls, value: str) -> str:
        if value not in COUNTRIES:
            raise PydanticCustomError('country_invalid', 'country_invalid')
        return value

    @field_validator('phone', mode='before')
    @classmethod
    def normalize_phone(cls, value):
        if value is None or value == '':
            return None
        if not isinstance(value, str):
            raise PydanticCustomError('phone_invalid', 'phone_invalid')
        value = re.sub(r'[\s-]', '', value).removeprefix('+')
        if not re.fullmatch(r'[0-9]{7,15}', value):
            raise PydanticCustomError('phone_invalid', 'phone_invalid')
        return value


class LoginRequest(BaseModel):
    @field_validator('email', mode='before')
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    email: str = Field(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str = Field(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    role: UserRole
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'


class AuthResponse(BaseModel):
    user: UserResponse
    tokens: TokenResponse


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
