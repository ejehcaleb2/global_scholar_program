"""Set activation state; repeated state preserves cutoff and records the confirmed attempt."""
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import operator_common as operator


async def run(args):
    from app.core.content import write_audit_log
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        administrator = await operator.actor(db, args.actor_email)
        target = await operator.user(db, args.email, lock=True)
        if not target:
            raise operator.OperatorError('Target user does not exist.')
        desired = args.activate
        if args.dry_run:
            print('DRY RUN: would set the requested activation state; no writes.')
            return
        changes = {}
        if target.is_active != desired:
            changes['is_active'] = {'from': target.is_active, 'to': desired}
            target.is_active = desired
            if not desired:
                cutoff = datetime.now(timezone.utc)
                changes['token_valid_after'] = {'from': target.token_valid_after, 'to': cutoff}
                target.token_valid_after = cutoff
        await write_audit_log(db, administrator.id, 'updated', 'user', target.id,
                              label=operator.label(target), changes=changes)
        await db.commit()
        print('Activation state recorded; prior tokens remain revoked after reactivation.')


def main(argv=None):
    parser = operator.parser(__doc__)
    parser.add_argument('--actor-email', required=True)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--deactivate', action='store_true')
    choice.add_argument('--activate', action='store_true')
    return operator.execute(run, parser.parse_args(argv))


if __name__ == '__main__':
    raise SystemExit(main())
