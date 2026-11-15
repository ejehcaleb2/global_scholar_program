# Global Scholars Program

GSP helps students in Cameroon prepare for university applications through courses,
resources, opportunities, masterclasses and review service requests. It is pre-launch.

The active checkout is `C:\Users\DELL\OneDrive\Desktop\global-scholar`.
Launchers derive their root from their own location. Keep one workspace open;
do not run another copy on the same ports.

## Requirements and numbered quick start

Windows PowerShell, Git, Node.js 24/npm 11, Python 3.13 with the Windows launcher,
and PostgreSQL 18 (running, client tools on PATH). The existing local venv uses
Python 3.14; use 3.13 for a fresh installation of the pinned asyncpg driver.
The local PostgreSQL role needs permission to create the isolated test database.

1. Clone your chosen repository and open that checkout. Run commands from its root.
2. Install dependencies:

   ```powershell
   py -3.13 -m venv backend/.venv
   backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
   npm --prefix app ci
   ```

3. Create the development database and private settings. Enter the PostgreSQL
   password at its prompt, never in command arguments:

   ```powershell
   psql -U postgres -W -c 'CREATE DATABASE "Global_scholar";'
   Copy-Item backend/.env.example backend/.env
   Copy-Item app/.env.local.example app/.env.local
   ```

   Privately edit `backend/.env`: set `APP_ENV=development`, your `DATABASE_URL`
   with scheme `postgresql+asyncpg` and the database above,
   `API_BASE_URL=http://127.0.0.1:8000`, and
   `CORS_ORIGINS=http://127.0.0.1:3000,http://localhost:3000`.
   Remove other empty assignments so defaults apply. URL-encode special characters
   in credentials. Keep the frontend API URL at `http://127.0.0.1:8000`.
   Generate the signing secret privately:

   ```powershell
   backend/.venv/Scripts/python.exe backend/scripts/generate_secret.py
   ```

4. Apply migrations:

   ```powershell
   Push-Location backend
   ./.venv/Scripts/python.exe -m alembic upgrade head
   ./.venv/Scripts/python.exe -m alembic check
   Pop-Location
   ```

   Seeding is optional; see the [runbook](docs/runbook.md). An empty database
   can start the application. Do not use development fixtures in production.
5. Start this checkout in two visible PowerShell windows:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
   ```

   Open [the app](http://127.0.0.1:3000). Stop both servers with Ctrl+C.
6. Prepare generated Next types and the test browser, then verify:

   ```powershell
   Push-Location app
   npx next typegen
   npx playwright install chromium
   Pop-Location
   powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
   ```

   Tests use the separate `Global_scholar_e2e` database and ports 8101/3101.
   Never run backend tests and browser tests concurrently.

## Layout and commands

| Path | Purpose |
|---|---|
| [app/app](app/app) | Next route wrappers, fonts, global tokens |
| [app/components](app/components) | Shared UI, shells and feature implementations |
| [app/lib](app/lib) | API client, queries, static copy and utilities |
| [backend/app](backend/app) | FastAPI, authorization, schemas, models, storage |
| [backend/alembic](backend/alembic) | Forward database migrations |
| [scripts](scripts) | Development and verification entrypoints |
| [docs](docs) | Durable knowledge; temporary program records stay in ignored `.work/` |

From `app/`: `npm run lint -- --max-warnings 0`, `npx tsc --noEmit`,
`npm run build`, `npm run e2e`. Generated types are needed before TypeScript
on a new checkout. The full verifier runs every gate serially.

Read [architecture](docs/architecture.md), [maintenance](docs/maintainers-guide.md),
[operations](docs/runbook.md), [product scope](docs/product-spec.md),
[handoff](SESSION_HANDOFF.md) and [engineering rules](AGENTS.md).
Cleanup is not a production-readiness verdict; deployment still requires the
[security checklist](docs/deployment-security-checklist.md).
