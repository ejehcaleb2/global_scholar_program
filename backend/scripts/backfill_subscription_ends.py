"""Dry-run by default. Explicit execution requires the verified Phase 0 backup."""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.gsp_models import Subscription, SubscriptionStatus


async def run(args):
    if args.execute:
        if get_settings().APP_ENV != 'development' and not args.allow_production:
            raise ValueError('Execution outside development requires a deliberate --allow-production run.')
        if not args.backup or not (args.backup / 'verification.json').is_file() or not any(path.stat().st_size for path in args.backup.glob('*.dump')):
            raise ValueError('Verified database --backup is required.')
    async with AsyncSessionLocal() as db:
        query = select(Subscription).where(Subscription.status == SubscriptionStatus.active, Subscription.current_period_end.is_(None)).order_by(Subscription.user_id)
        if args.execute:
            query = query.with_for_update()
        rows = (await db.scalars(query)).all()
        end = datetime.now(timezone.utc) + timedelta(days=30)
        for row in rows:
            print('user_id=' + str(row.user_id))
            if args.execute:
                row.current_period_end = end
        if args.execute:
            await db.commit()
        print(('updated=' if args.execute else 'would_update=') + str(len(rows)))
    await AsyncSessionLocal.kw['bind'].dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--allow-production', action='store_true')
    asyncio.run(run(parser.parse_args()))
