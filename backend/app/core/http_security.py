"""Request correlation, safe diagnostics and response headers."""
import logging
import re
import traceback
from contextvars import ContextVar
from uuid import uuid4

from fastapi.responses import JSONResponse

request_id = ContextVar('request_id', default='startup')
_id_pattern = re.compile(r'^[A-Za-z0-9-]{8,64}$')


def redact(value: str) -> str:
    value = re.sub(r'(?i)([\"\x27]?(?:password|(?:access_|refresh_)?token|jwt_secret)[\"\x27]?\s*[:=]\s*)([\"\x27])(?:\\.|(?!\2).)*?\2', r'\1"[REDACTED]"', value)
    value = re.sub(r'(?i)(authorization[\s\"\x27:=]+)(?:(?:Bearer|Basic)\s+)?[^\s,;\}\"\x27]+', r'\1[REDACTED]', value)
    value = re.sub(r'(?i)((?:password|(?:access_|refresh_)?token|jwt_secret)[\"\x27]*\s*[:=]\s*[\"\x27]?)[^\s,;\}\"\x27]+', r'\1[REDACTED]', value)
    value = re.sub(r'eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED]', value)
    value = re.sub(r'\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}', '[REDACTED]', value)
    value = re.sub(r'((?:postgres(?:ql)?(?:\+asyncpg)?|https?)://[^\s:/]+:)[^\s@]+@', r'\1[REDACTED]@', value)
    return re.sub(r'\b([A-Za-z0-9])[A-Za-z0-9.!#$%&\x27*+/?^_`{|}~-]*@([A-Za-z0-9.-]+)', r'\1***@\2', value)


class RedactionFilter(logging.Filter):
    def filter(self, record):
        record.request_id = getattr(record, 'request_id', request_id.get())
        if record.name != 'uvicorn.access':
            record.msg = redact(record.getMessage())
            record.args = ()
        else:
            record.msg = redact(str(record.msg))
        if isinstance(record.args, tuple):
            record.args = tuple(redact(v) if isinstance(v, str) else v for v in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: '[REDACTED]' if re.search('password|token|authorization|secret', k, re.I) else redact(v) if isinstance(v, str) else v for k, v in record.args.items()}
        if record.exc_info:
            record.exc_text = redact(''.join(traceback.format_exception(*record.exc_info)))
            record.exc_info = None
        return True


class CorrelatedFormatter(logging.Formatter):
    def __init__(self, original):
        super().__init__()
        self.original = original or logging.Formatter('%(levelname)s: %(message)s')

    def format(self, record):
        RedactionFilter().filter(record)
        return '\n'.join(f'[request_id={record.request_id}] {line}' for line in redact(self.original.format(record)).splitlines())


def configure_logging():
    if not logging.getLogger().handlers:
        logging.getLogger().addHandler(logging.StreamHandler())
    # The factory also protects records captured by later-installed handlers.
    previous = logging.getLogRecordFactory()
    if not getattr(previous, '_gsp_safe', False):
        def factory(*args, **kwargs):
            record = previous(*args, **kwargs)
            RedactionFilter().filter(record)
            return record
        factory._gsp_safe = True
        logging.setLogRecordFactory(factory)
    for name in ('', 'uvicorn', 'uvicorn.error', 'uvicorn.access'):
        logger = logging.getLogger(name)
        logger.addFilter(RedactionFilter())
        for handler in logger.handlers:
            if not isinstance(handler.formatter, CorrelatedFormatter):
                handler.setFormatter(CorrelatedFormatter(handler.formatter))


class SecurityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = dict(scope['headers'])
        supplied = headers.get(b'x-request-id', b'').decode('latin-1')
        identifier = supplied if _id_pattern.fullmatch(supplied) else str(uuid4())
        token = request_id.set(identifier)
        started = False

        async def safe_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
                response_headers = list(message.get('headers', []))
                existing = {k.lower(): v for k, v in response_headers}
                for key, value in [(b'x-content-type-options', b'nosniff'), (b'referrer-policy', b'no-referrer'), (b'x-frame-options', b'DENY')]:
                    if key not in existing:
                        response_headers.append((key, value))
                if b'authorization' in headers and b'application/json' in existing.get(b'content-type', b'') and b'cache-control' not in existing:
                    response_headers.append((b'cache-control', b'no-store'))
                response_headers = [(k, v) for k, v in response_headers if k.lower() != b'x-request-id']
                response_headers.append((b'x-request-id', identifier.encode()))
                message['headers'] = response_headers
            await send(message)

        try:
            await self.app(scope, receive, safe_send)
        except Exception:
            logging.getLogger('gsp.errors').exception('Unhandled request exception')
            if started:
                raise
            await JSONResponse(status_code=500, content={'detail': 'Internal server error', 'request_id': identifier})(scope, receive, safe_send)
        finally:
            request_id.reset(token)
