"""Grant beta/monthly access or extend its current future end; never duplicate active rows."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import operator_common as operator


async def run(args):
    from sqlalchemy import select
    from app.core.content import write_audit_log
    from app.db.session import AsyncSessionLocal
    from app.models.gsp_models import Subscription, SubscriptionPlan, SubscriptionStatus
    if args.days <= 0:
        raise operator.OperatorError('Days must be a positive integer.')
    async with AsyncSessionLocal() as db:
        administrator = await operator.actor(db, args.actor_email)
        target = await operator.user(db, args.email, lock=True)
        if not target:
            raise operator.OperatorError('Target user does not exist.')
        current = await db.scalar(select(Subscription).where(
            Subscription.user_id == target.id, Subscription.status == SubscriptionStatus.active,
        ).order_by(Subscription.current_period_end.desc().nullslast(), Subscription.created_at.desc()).limit(1).with_for_update())
        now = datetime.now(timezone.utc)
        start = current.current_period_end if current and current.current_period_end and current.current_period_end > now else now
        try:
            end = start + timedelta(days=args.days)
        except OverflowError:
            raise operator.OperatorError('Days exceed the supported timestamp range.') from None
        if args.dry_run:
            print('DRY RUN: would grant/extend the membership; no writes.')
            return
        before = {'plan': current.plan.value if current else None, 'status': current.status.value if current else None,
                  'current_period_end': current.current_period_end if current else None}
        if not current:
            current = Subscription(user_id=target.id)
            db.add(current)
        current.plan, current.status, current.current_period_end = SubscriptionPlan(args.plan), SubscriptionStatus.active, end
        await db.flush()
        changes = {key: {'from': before[key], 'to': value} for key, value in
                   {'plan': current.plan.value, 'status': current.status.value, 'current_period_end': end}.items() if before[key] != value}
        await write_audit_log(db, administrator.id, 'created' if before['plan'] is None else 'updated',
                              'subscription', current.id, label=operator.label(target), changes=changes)
        await db.commit()
        print('Membership granted/extended; one active subscription record retained.')


def main(argv=None):
    parser = operator.parser(__doc__)
    parser.add_argument('--plan', choices=['beta', 'monthly'], required=True)
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--actor-email', required=True)
    return operator.execute(run, parser.parse_args(argv))


if __name__ == '__main__':
    raise SystemExit(main())
