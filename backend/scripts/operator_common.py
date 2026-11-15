"""Shared, credential-safe operator confirmation and validation."""
import argparse
import asyncio
import getpass
import os
import re
import sys
import unicodedata


class OperatorError(ValueError):
    """Only controlled messages belong in this exception."""


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        self.exit(2, 'Invalid command arguments. Use --help; input values are not logged.\n')


def parser(description):
    result = SafeParser(description=description)
    result.add_argument('--email', required=True)
    result.add_argument('--yes', action='store_true', help='Confirm changes to the displayed database')
    result.add_argument('--dry-run', action='store_true', help='Validate and inspect without writes')
    return result


def email(value):
    normalized = value.strip().lower()
    if len(normalized) > 255 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', normalized):
        raise OperatorError('A valid email address is required.')
    return normalized


def full_name(value):
    normalized = ''.join(char for char in value if unicodedata.category(char) != 'Cc').strip()
    if not 1 <= len(normalized) <= 120:
        raise OperatorError('Full name must contain 1 to 120 characters.')
    return normalized


def interactive_input():
    if not sys.stdin.isatty():
        return False
    if os.name == 'nt':
        # Windows reports the NUL character device as a tty; it is not a console.
        import ctypes
        import msvcrt
        mode = ctypes.c_ulong()
        return bool(ctypes.windll.kernel32.GetConsoleMode(
            msvcrt.get_osfhandle(sys.stdin.fileno()), ctypes.byref(mode)))
    return True


def password(address, name):
    value = os.environ.get('ADMIN_PASSWORD')
    if value is None:
        if not interactive_input():
            raise OperatorError('Set ADMIN_PASSWORD or use an interactive terminal for hidden password entry.')
        value = getpass.getpass('New administrator password: ')
        if value != getpass.getpass('Repeat administrator password: '):
            raise OperatorError('Password confirmation does not match.')
    from app.core.password_policy import password_error
    failure = password_error(value, address, name)
    if failure:
        raise OperatorError('Password rejected by policy: ' + failure)
    return value


async def user(db, address, *, lock=False):
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload
    from app.models.gsp_models import User
    query = select(User).options(selectinload(User.profile)).where(func.lower(User.email) == email(address))
    return await db.scalar(query.with_for_update() if lock else query)


async def actor(db, address):
    from app.models.gsp_models import UserRole
    result = await user(db, address)
    if not result or result.role != UserRole.admin or not result.is_active:
        raise OperatorError('Actor must be an existing active administrator.')
    return result


def label(target):
    return target.profile.full_name if target.profile and target.profile.full_name else str(target.id)


async def _invoke(handler, args):
    try:
        await handler(args)
    finally:
        module = sys.modules.get('app.db.session')
        if module:
            await module.engine.dispose()


def execute(handler, args):
    try:
        from sqlalchemy.engine import make_url
        from app.core.config import get_settings
        target = make_url(get_settings().DATABASE_URL)
        print('Database host: ' + (target.host or '(local socket)'), flush=True)
        print('Database name: ' + (target.database or '(unset)'), flush=True)
        if not args.dry_run and not args.yes:
            if not interactive_input() or input('Type yes to modify this database: ').strip() != 'yes':
                raise OperatorError('Changes require --yes or an interactive yes confirmation.')
        asyncio.run(_invoke(handler, args))
        return 0
    except OperatorError as failure:
        print('Error: ' + str(failure), file=sys.stderr)
        return 1
    except Exception as failure:
        # Settings/SQL exceptions can contain credential-bearing values or parameters.
        print('Operation failed (' + type(failure).__name__ + '); no input values are logged.', file=sys.stderr)
        return 1
