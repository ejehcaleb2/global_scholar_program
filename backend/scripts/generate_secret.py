"""Rotate the local JWT secret without displaying it or changing other settings."""

import os
import re
import secrets
import tempfile
from pathlib import Path


def generate_secret(env_file: Path | None = None) -> None:
    target = env_file or Path(__file__).resolve().parents[1] / '.env'
    original = target.read_bytes() if target.exists() else b''
    newline = b'\r\n' if b'\r\n' in original else b'\n'
    replacement = b'JWT_SECRET=' + secrets.token_urlsafe(48).encode('ascii')
    output: list[bytes] = []
    found = False
    for line in original.splitlines(keepends=True):
        if re.match(rb'^[ \t]*JWT_SECRET[ \t]*=', line):
            ending = b'\r\n' if line.endswith(b'\r\n') else b'\n' if line.endswith(b'\n') else b''
            output.append(replacement + ending)
            found = True
        else:
            output.append(line)
    if not found:
        if original and not original.endswith((b'\r', b'\n')):
            output.append(newline)
        output.append(replacement + newline)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.jwt-', dir=target.parent)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(b''.join(output))
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == '__main__':
    generate_secret()
    print('Updated JWT_SECRET in backend/.env; no secret displayed.')
