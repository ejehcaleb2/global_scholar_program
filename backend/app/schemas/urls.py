"""Validation for optional external content links; stored values remain strings."""
from pydantic import HttpUrl, TypeAdapter

_HTTP_URL = TypeAdapter(HttpUrl)


def validate_http_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    _HTTP_URL.validate_python(value)
    return value
