"""Delete only explicitly owned E2E request fixtures, never seed or development rows."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.models.gsp_models import AuditLog, ServiceRequest, ServiceRequestEvent


async def cleanup(ids: list[UUID]) -> None:
    url = make_url(os.environ.get('DATABASE_URL', ''))
    if os.environ.get('APP_ENV') != 'test' or url.database != 'Global_scholar_e2e' or url.host not in {'localhost', '127.0.0.1', '::1'}:
        raise RuntimeError('Refusing cleanup outside the fixed local E2E database')
    baseline_path = Path(__file__).resolve().parents[2] / 'app/test-artifacts/e2e-baseline.json'
    baseline = json.loads(baseline_path.read_text(encoding='utf8'))
    if set(map(str, ids)) & set(baseline['service_requests']['ids']):
        raise RuntimeError('Refusing to delete a seed service request')
    engine = create_async_engine(url)
    try:
        async with async_sessionmaker(engine)() as db:
            async with db.begin():
                actual = set((await db.scalars(select(ServiceRequest.id).where(ServiceRequest.id.in_(ids)).with_for_update())).all())
                if actual != set(ids):
                    raise RuntimeError('Requested cleanup IDs do not match existing E2E fixtures')
                audit = await db.execute(delete(AuditLog).where(AuditLog.entity_type == 'service_request', AuditLog.entity_id.in_(list(map(str, ids)))))
                events = await db.execute(delete(ServiceRequestEvent).where(ServiceRequestEvent.service_request_id.in_(ids)))
                requests = await db.execute(delete(ServiceRequest).where(ServiceRequest.id.in_(ids)))
            print(json.dumps({'requests': requests.rowcount, 'events': events.rowcount, 'audits': audit.rowcount}))
    finally:
        await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='+', type=UUID)
    arguments = parser.parse_args()
    if not 1 <= len(arguments.ids) <= 20:
        parser.error('Supply between one and twenty explicit request IDs')
    asyncio.run(cleanup(arguments.ids))
