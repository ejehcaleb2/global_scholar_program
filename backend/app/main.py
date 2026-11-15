import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.core.http_security import SecurityMiddleware, configure_logging

from app.core.legal import ensure_legal_ready
from app.routers.legal import router as legal_router
from app.routers.consents import router as consent_router
from app.core.config import get_settings
from app.core.rate_limit import cleanup_task

from app.core.cors import add_cors_middleware
from app.routers.auth import router as auth_router
from app.routers.admin_content import router as admin_content_router
from app.routers.admin_dashboard import router as admin_dashboard_router
from app.routers.admin_students import router as admin_students_router
from app.routers.content import router as content_router
from app.routers.progress import router as progress_router
from app.routers.service_requests import router as service_requests_router
from app.routers.homepage_posts import admin_router as homepage_admin_router
from app.routers.homepage_posts import public_router as homepage_public_router
from app.routers.media import admin_router as media_admin_router
from app.routers.media import public_router as media_public_router
from app.routers.profile import router as profile_router

@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_legal_ready(get_settings().APP_ENV)
    logging.getLogger('uvicorn.error').info('CORS origins: %s', get_settings().cors_origins)
    async with cleanup_task():
        yield


configure_logging()
production = get_settings().APP_ENV == 'production'
app = FastAPI(title='GSP API', version='0.1.0', lifespan=lifespan,
              docs_url=None if production else '/docs', redoc_url=None if production else '/redoc',
              openapi_url=None if production else '/openapi.json')
add_cors_middleware(app)
app.add_middleware(SecurityMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc):
    return JSONResponse(status_code=422, content={'detail': [
        {key: error[key] for key in ('loc', 'msg', 'type')} for error in exc.errors()
    ]})
app.include_router(auth_router)
app.include_router(legal_router)
app.include_router(consent_router)
app.include_router(admin_content_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_students_router)
app.include_router(content_router)
app.include_router(progress_router)
app.include_router(service_requests_router)
app.include_router(homepage_admin_router)
app.include_router(homepage_public_router)
app.include_router(media_admin_router)
app.include_router(media_public_router)
app.include_router(profile_router)


@app.get('/health')
def health_check() -> dict[str, str]:
    return {'status': 'ok'}
