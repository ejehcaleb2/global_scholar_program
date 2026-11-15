from functools import lru_cache
from hashlib import sha256
from typing import Literal
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_REJECTED_JWT_FINGERPRINTS = frozenset({'92809ab604c9377285fbbcf82c4f30db65f107ecfd7217c7e62c17a2b3be7633'})


class Settings(BaseSettings):
    TRUSTED_PROXY_COUNT: int = Field(default=0, ge=0)
    RATE_LOGIN_PAIR: int = Field(default=5, ge=1)
    RATE_LOGIN_EMAIL: int = Field(default=10, ge=1)
    RATE_LOGIN_IP: int = Field(default=120, ge=1)
    RATE_SIGNUP_IP: int = Field(default=30, ge=1)
    RATE_SIGNUP_EMAIL: int = Field(default=5, ge=1)
    RATE_REFRESH_IP: int = Field(default=60, ge=1)
    RATE_PROFILE_FAILURES: int = Field(default=5, ge=1)
    RATE_SERVICE_UPLOAD: int = Field(default=10, ge=1)
    RATE_AVATAR_UPLOAD: int = Field(default=10, ge=1)
    RATE_ADMIN_UPLOAD: int = Field(default=60, ge=1)

    APP_ENV: Literal["development", "test", "production"] = "production"
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore', hide_input_in_errors=True)

    DATABASE_URL: str = Field(..., description='Explicit PostgreSQL connection URL')
    JWT_SECRET: str = Field(repr=False)
    JWT_ALGORITHM: str = 'HS256'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    API_BASE_URL: str = 'http://127.0.0.1:8000'
    AWS_ACCESS_KEY_ID: str = Field(default='', repr=False)
    AWS_SECRET_ACCESS_KEY: str = Field(default='', repr=False)
    AWS_REGION: str = 'us-east-1'
    S3_BUCKET_NAME: str = 'gsp-dev-storage'
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"


    @field_validator('JWT_SECRET')
    @classmethod
    def strong_jwt_secret(cls, value: str) -> str:
        placeholders = {'change-me', 'changeme', 'secret', 'your-secret-key', 'supersecret', 'test'}
        if (len(value.strip()) < 32 or value.strip().casefold() in placeholders
                or sha256(value.encode()).hexdigest() in _REJECTED_JWT_FINGERPRINTS):
            raise ValueError('Set JWT_SECRET to a new random secret of at least 32 characters; run python scripts/generate_secret.py')
        return value



    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip().rstrip('/') for origin in self.CORS_ORIGINS.split(',') if origin.strip()]

    @model_validator(mode='after')
    def production_cors(self) -> 'Settings':
        if self.APP_ENV == 'production' and any(
            '*' in origin or 'localhost' in origin.casefold() or '127.0.0.1' in origin
            for origin in self.cors_origins
        ):
            raise ValueError('Set CORS_ORIGINS to explicit public origins without localhost, 127.0.0.1 or wildcards for production')
        return self



@lru_cache

def get_settings() -> Settings:
    return Settings()
