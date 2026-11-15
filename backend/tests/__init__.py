"""Test-only environment setup; production configuration stays fail-fast."""
import os
import secrets


def configure_test_environment() -> None:
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault("RATE_LOGIN_IP", "10000")
    os.environ.setdefault("RATE_SIGNUP_IP", "10000")
    os.environ.setdefault("RATE_REFRESH_IP", "10000")
    os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))


def credential(name: str = "GSP_TEST_PASSWORD") -> str:
    """Test credentials come from the environment or a private generated value."""
    if not os.environ.get(name):
        os.environ[name] = secrets.token_urlsafe(18)
    return os.environ[name]
