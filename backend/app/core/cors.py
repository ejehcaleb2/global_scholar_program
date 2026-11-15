from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings


def add_cors_middleware(app) -> None:
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allow_headers=['Authorization', 'Content-Type', 'X-Request-ID'],
        expose_headers=['Retry-After', 'X-Request-ID', 'Content-Disposition'],
    )
