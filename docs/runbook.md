# Operations runbook

Follow the [numbered quick start](../README.md). Fresh installs use Python 3.13;
PostgreSQL client tools must be on PATH. Keep the user-selected OneDrive checkout active.

## Development and builds

From root, `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1` checks private
env files, dependencies and ports, then opens two visible windows. Backend reloads
on 127.0.0.1:8000; frontend uses 127.0.0.1:3000. Stop both with Ctrl+C.
Read-only checks while running:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/health -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:3000/login -UseBasicParsing | Select-Object StatusCode
```

From `app/`: `npm run lint -- --max-warnings 0`, `npx tsc --noEmit`, `npm run build`.
On a new checkout, run `npx next typegen` before TypeScript because its types and
`next-env.d.ts` are generated/ignored. Production preview after building is
`npm run start -- --hostname 127.0.0.1`. localhost and 127.0.0.1 are different CORS origins.

## Tests and verification

From root: `powershell -ExecutionPolicy Bypass -File scripts/verify.ps1`.
It stops on the first failing gate: zero-warning lint, TypeScript, build, backend
unittest, Alembic drift, then E2E. It prepares only `Global_scholar_e2e` and prints
actual passed/failed/skipped/flaky/retried counts. Any skip, retry or flake fails.
Redacted logs/summary go under `.work/logs/verify`; browser artifacts under
`app/test-artifacts`. Never commit temporary program records.

Manual backend tests require a dedicated test shell. From root:

```powershell
backend/.venv/Scripts/python.exe backend/scripts/e2e_db.py --reset
Get-Content .env.e2e | ForEach-Object {
  $key, $encoded = $_ -split '=', 2
  Set-Item -Path "Env:$key" -Value ($encoded | ConvertFrom-Json)
}
$env:GSP_UPLOAD_DIR = $env:GSP_E2E_UPLOAD_DIR
Push-Location backend
./.venv/Scripts/python.exe -m unittest discover tests
./.venv/Scripts/python.exe -m alembic check
Pop-Location
```

Close that shell afterward; do not leak test variables into development commands.
Never print its env file. From `app/`, `npm run e2e` resets the same guarded DB,
runs at ports 8101/3101 with server reuse forbidden, then removes extra rows/uploads.
Run backend and browser suites serially. Operator tests deliberately require the
exact E2E database. A separate database ending `_cleancheck` proves fresh migrations;
run backend tests using the separate E2E configuration above.

No `rehearsal` npm script exists; implementing launch rehearsal/readiness is future work.

## Migrations, development fixtures and operators

In a fresh development shell, from `backend/`:

```powershell
./.venv/Scripts/python.exe -m alembic current
./.venv/Scripts/python.exe -m alembic heads
./.venv/Scripts/python.exe -m alembic upgrade head
./.venv/Scripts/python.exe -m alembic check
```

Use forward migrations; never edit applied files. For a clean-install proof, create
a database ending `_cleancheck`, configure its private development URL, run upgrade/check,
then use the isolated E2E environment for unit tests. Drop only the owned scratch DB.

Optional fixtures: `./.venv/Scripts/python.exe scripts/seed_data.py` from `backend/`.
It requires development mode, generates private credentials and writes ignored files.
Do not paste its output into evidence. Existing A1/H1 additive fixture modes remain
for tests; seed-only password reset is `--reset-passwords`. Never seed production.

Operator CLIs: [create_admin.py](../backend/scripts/create_admin.py),
[grant_membership.py](../backend/scripts/grant_membership.py),
[set_user_active.py](../backend/scripts/set_user_active.py),
[generate_secret.py](../backend/scripts/generate_secret.py),
[check_production_config.py](../backend/scripts/check_production_config.py),
[backfill_subscription_ends.py](../backend/scripts/backfill_subscription_ends.py),
[cleanup_test_data.py](../backend/scripts/cleanup_test_data.py).
Read `--help` first; use dry-run where available. See [maintenance](maintainers-guide.md).
Production validation intentionally fails on unreviewed local settings.

## Backup and restore

Back up PostgreSQL and the matching private uploads together under `C:\gsp-backups\`,
outside OneDrive, before destructive work. Use a password prompt or protected pgpass;
never put credentials in command arguments. Example operator recipes:

```powershell
pg_dump -U postgres -W -Fc -f C:\gsp-backups\gsp.dump Global_scholar
pg_restore --list C:\gsp-backups\gsp.dump
```

Copy the active uploads at the same maintenance point and verify a manifest.
Test restoration to a separate empty scratch DB with
`pg_restore -U postgres -W --exit-on-error -d <scratch> <dump>`.
Restore matching uploads separately, set process `GSP_UPLOAD_DIR`, verify counts
and authorized downloads. These are recipes, not a claimed production restore test.
Never restore over live data without a separate plan.

## Troubleshooting

- Wrong content/occupied ports: stop the known server in its window; launch this
  checkout explicitly. Do not kill unrelated processes.
- Missing Next types: run `npx next typegen` in `app/`.
- Backend stale code: use reload or restart uvicorn.
- Upload path ignored: set `GSP_UPLOAD_DIR` in the process environment; a dotenv extra is insufficient.
- User cleanup restricted: audit rows intentionally block deletion; tests remove their own audit rows first.
- Windows multiline Python: write a temporary file. Use the project venv/unittest, not system Python/pytest.
- Missing private clone files: recreate from public env examples; never commit credentials/uploads/original media.
- CSP/legal startup rejection: supply valid configuration and reviewed policy text; never bypass review markers.
- OneDrive links: Playwright does not discover linked spec files. Materialize authored test files without
  altering bytes and check `npx playwright test --list` against expected coverage.

Historical verification is recoverable from `archive/pre-cleanup-2026-11-07`.
Current verification commands are above. Removing working files does not shrink old Git objects.
