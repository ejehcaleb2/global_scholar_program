"""Create the first admin, or explicitly promote an existing user; no consent receipts."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import operator_common as operator


async def run(args):
    from app.core.content import write_audit_log
    from app.core.security import get_password_hash
    from app.db.session import AsyncSessionLocal
    from app.models.gsp_models import Profile, User, UserRole
    address, name = operator.email(args.email), operator.full_name(args.full_name)
    async with AsyncSessionLocal() as db:
        target = await operator.user(db, address, lock=True)
        if target and not args.promote:
            raise operator.OperatorError('Email already exists; use --promote to promote the existing account.')
        if not target and args.promote:
            raise operator.OperatorError('Promotion requires an existing user.')
        if target:
            changes = {}
            if target.role != UserRole.admin:
                changes['role'] = {'from': target.role.value, 'to': UserRole.admin.value}
            if not target.profile or target.profile.full_name != name:
                changes['full_name'] = {'from': target.profile.full_name if target.profile else None, 'to': name}
            if args.dry_run:
                print('DRY RUN: would promote/update the existing administrator account; no writes.')
                return
            target.role = UserRole.admin
            if target.profile:
                target.profile.full_name = name
            else:
                target.profile = Profile(full_name=name)
            action = 'updated'
        else:
            value = operator.password(address, name)
            if args.dry_run:
                print('DRY RUN: would create an administrator and profile; no consent rows or other writes.')
                return
            target = User(email=address, hashed_password=get_password_hash(value), role=UserRole.admin,
                          is_active=True, profile=Profile(full_name=name))
            db.add(target)
            action = 'created'
            changes = {'role': {'from': None, 'to': 'admin'}, 'full_name': {'from': None, 'to': name}}
        await db.flush()
        await write_audit_log(db, target.id, action, 'user', target.id, label=name, changes=changes)
        await db.commit()
        print('Administrator created.' if action == 'created' else 'Administrator promotion/update recorded.')


def main(argv=None):
    parser = operator.parser(__doc__)
    parser.add_argument('--full-name', required=True)
    parser.add_argument('--promote', action='store_true')
    return operator.execute(run, parser.parse_args(argv))


if __name__ == '__main__':
    raise SystemExit(main())
