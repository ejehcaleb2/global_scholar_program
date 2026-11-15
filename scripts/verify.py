"""Run repository gates serially against the guarded isolated test database."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LOGS = ROOT / '.work' / 'logs' / 'verify'
LOGS.mkdir(parents=True, exist_ok=True)
ENV = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'NEXT_TELEMETRY_DISABLED': '1'}
SENSITIVE = []
STAGES = []
ROWS = []


def redact(output):
    for value in sorted(set(SENSITIVE), key=len, reverse=True):
        if value:
            output = output.replace(value, '[redacted]')
    output = re.sub(r'Bearer\s+\S+', 'Bearer [redacted]', output, flags=re.I)
    output = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted token]', output)
    output = re.sub(r'\$2[aby]\$[^\s]+', '[redacted hash]', output)
    return output


def summary():
    print('\nSuite        Passed Failed Skipped Flaky Retried', flush=True)
    for name, values in ROWS:
        print(f'{name:12} ' + ' '.join(f'{value:6}' for value in values), flush=True)
    (LOGS / 'summary.json').write_text(json.dumps({'stages': STAGES, 'suites': dict(ROWS)}, indent=2), encoding='utf8')


def run(name, command, directory, environment=None, allow_failure=False):
    print(f'RUN {name}', flush=True)
    result = subprocess.run(command, cwd=directory, env=environment or ENV, capture_output=True, text=True, encoding='utf8', errors='replace')
    output = redact(result.stdout + result.stderr)
    (LOGS / (name + '.log')).write_text(output, encoding='utf8')
    STAGES.append({'gate': name, 'exit': result.returncode})
    print(f'{name}: exit {result.returncode}', flush=True)
    if result.returncode and not allow_failure:
        print('\n'.join(output.splitlines()[-25:]), flush=True)
        summary()
        raise SystemExit(result.returncode)
    return output


def main():
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    npx = 'npx.cmd' if os.name == 'nt' else 'npx'
    for name, command in [('lint', [npm, 'run', 'lint', '--', '--max-warnings', '0']), ('typescript', [npx, 'tsc', '--noEmit']), ('build', [npm, 'run', 'build'])]:
        run(name, command, ROOT / 'app')
    run('isolated-database', [sys.executable, 'scripts/e2e_db.py', '--reset'], ROOT / 'backend')
    values = {key: json.loads(value) for key, value in (line.split('=', 1) for line in (ROOT / '.env.e2e').read_text(encoding='utf-8-sig').splitlines() if line)}
    from sqlalchemy.engine import make_url
    if make_url(values['DATABASE_URL']).database != 'Global_scholar_e2e':
        raise RuntimeError('Refusing a non-isolated test database')
    SENSITIVE.extend(str(value) for key, value in values.items() if 'PASSWORD' in key or 'SECRET' in key)
    SENSITIVE.extend([values['DATABASE_URL'], make_url(values['DATABASE_URL']).password or ''])
    ENV.update(values)
    ENV['GSP_UPLOAD_DIR'] = values['GSP_E2E_UPLOAD_DIR']
    output = run('backend', [sys.executable, '-m', 'unittest', 'discover', 'tests'], ROOT / 'backend', allow_failure=True)
    count = re.search(r'^Ran (\d+) tests?', output, re.M)
    if not count:
        raise RuntimeError('Missing successful unittest summary')
    skipped = re.search(r'skipped=(\d+)', output)
    skips = int(skipped[1]) if skipped else 0
    failures = sum(int(match[1]) for match in re.finditer(r'(?:failures|errors|unexpected successes)=(\d+)', output))
    ROWS.append(('unittest', [int(count[1]) - skips - failures, failures, skips, 0, 0]))
    if STAGES[-1]['exit'] or failures or skips or not re.search(r'^OK(?:\s|$)', output, re.M):
        summary()
        raise SystemExit('Backend failures, errors or skipped tests are forbidden')
    run('alembic', [sys.executable, '-m', 'alembic', 'check'], ROOT / 'backend')
    report_path = ROOT / 'app/test-artifacts/verify-playwright.json'
    report_path.unlink(missing_ok=True)
    browser_environment = {**ENV, 'PLAYWRIGHT_JSON_OUTPUT_FILE': str(report_path)}
    run('browser', [npm, 'run', 'e2e', '--', '--reporter=list,json', '--retries=0'], ROOT / 'app', browser_environment, allow_failure=True)
    report_text = redact(report_path.read_text(encoding='utf8'))
    report_path.write_text(report_text, encoding='utf8')
    report = json.loads(report_text)
    stats = report['stats']
    retried = 0
    discovered_files = set()
    def inspect(suite):
        nonlocal retried
        for spec in suite.get('specs', []):
            discovered_files.add(spec['file'].replace('\\', '/'))
            for test in spec['tests']:
                retried += sum(result.get('retry', 0) > 0 for result in test.get('results', []))
        for child in suite.get('suites', []):
            inspect(child)
    for suite in report['suites']:
        inspect(suite)
    authored_files = {path.relative_to(ROOT / 'app/tests/e2e').as_posix() for path in (ROOT / 'app/tests/e2e').rglob('*.spec.ts')}
    values = [stats[key] for key in ['expected', 'unexpected', 'skipped', 'flaky']] + [retried]
    ROWS.append(('Playwright', values))
    summary()
    if discovered_files != authored_files:
        raise SystemExit('Browser discovery omitted authored specs: ' + ', '.join(sorted(authored_files - discovered_files)))
    if STAGES[-1]['exit'] or any(values[1:]) or not values[0] or report['errors'] or any(project['retries'] != 0 for project in report['config']['projects']):
        raise SystemExit('Browser proof contains failures, skips, flakes, retries or runner errors')
    print('ALL GATES PASS', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        summary()
        print(redact(str(error)), file=sys.stderr)
        raise SystemExit(1)
