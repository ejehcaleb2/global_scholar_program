# Deployment security checklist

Follow AGENTS.md. This is an operator checklist, not evidence that production is ready.
Historical CFP verification is recoverable from archive/pre-cleanup-2026-11-07; see the runbook for current verification commands.

## Before deployment

- Resolve the missing approved AGENTS.new.md and review the implementation register.
- Re-run dependency audits before deployment. RRP upgraded next/eslint-config-next to
  exact 16.4.3; production audit is clean. Moderate dev-only lint risks are documented;
  no force fix was used.
- Retain enforcing nonce CSP after the authorized zero-finding Report-Only trial.
  Retain the explicit credential-rejection and inactive-token matrix exceptions.
- Review all dependency findings and run the complete gates against the release artifact.
  The current Windows runtime has newer versions of some non-security dependencies than
  their exact requirements pins. Verify a clean production interpreter installation;
  existing-environment test results alone do not prove that installation is reproducible.
- Run from `backend/`: `python scripts/check_production_config.py`. Require every line
  to say PASS. The script prints check names only. Development is expected to fail.

## Environment and hosting

- Set `APP_ENV=production`, an explicit `DATABASE_URL` for the application role,
  `JWT_SECRET`, `JWT_ALGORITHM`, `API_BASE_URL`, and comma-separated `CORS_ORIGINS`.
  Set `NEXT_PUBLIC_API_URL` at the frontend build to the public HTTPS API origin.
  Never put a signing key, database credential or private storage credential in a
  `NEXT_PUBLIC_` variable. Keep local environment files out of commits and artifacts.
- Generate the signing key privately with `python scripts/generate_secret.py` in
  the intended backend environment. Store it in the host's secret manager; never paste
  it into logs or this checklist. Rotating it invalidates all existing sessions.
  Coordinate a maintenance window and require users to log in again. Rotate any
  historically exposed database/AWS credentials at their provider, not just locally.
- Use TLS at the ingress for both frontend and API, redirect public HTTP to HTTPS,
  and verify redirects and certificate renewal. Set `ENABLE_HSTS=true` only after HTTPS
  works; Next emits HSTS only with that flag and a production build. Start with the
  intended domain/subdomain policy before relying on the included subdomain directive.
- CORS must enumerate actual frontend origins, including scheme and port when used;
  no wildcard, localhost or loopback. Test both permitted and rejected origins.
- Set `TRUSTED_PROXY_COUNT` explicitly. Zero means direct connections. A positive
  count requires a verified ingress chain that strips untrusted forwarding headers;
  choose the real count, do not copy an assumed value. Test limiter client identity.
- Access tokens currently last 60 minutes; refresh tokens seven days. Document any
  override. The frontend has no automatic refresh call and still uses sessionStorage.
- Production docs, redoc and OpenAPI URLs are disabled by APP_ENV. Verify actual 404
  responses at the deployed origin; development docs are intentionally available.

## Database permissions and credential rotation

Run these steps deliberately as the database owner against the intended application
database after a verified backup. They were **not executed** by CFP. Replace quoted
database/owner identifiers with the actual names. `\password` prompts privately;
never put a password literal in a command, shell history, SQL file or report.

```sql
-- psql, connected to the intended application database as its owner:
SELECT current_database(), current_user;
CREATE ROLE gsp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\password gsp_app
GRANT CONNECT ON DATABASE "application_database" TO gsp_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gsp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gsp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gsp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE "migration_owner" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gsp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE "migration_owner" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO gsp_app;
REVOKE UPDATE, DELETE ON audit_logs, service_request_events, consents FROM gsp_app;
-- Rotate the old superuser credential through the provider or this private prompt:
\password postgres
```

Keep Alembic on a separately controlled owner/migration credential; do not grant DDL
or superuser privileges to the application role. Reapply append-only table revocations
after migrations that recreate those tables. Update deployment secret references,
test the new application connection, and revoke retired credential access. Confirm
SELECT/INSERT/UPDATE/DELETE for the required application flows, and denied DDL plus
denied audit/consent/event edits. Managed providers may require provider-managed
rotation for their owner account instead of a local superuser password command.

Backfill active subscriptions with missing ends before switching access rules on a
production dataset. First run `python scripts/backfill_subscription_ends.py` and review
user ids/counts. Then deliberately use `--execute --allow-production --backup <directory>`
with a fresh custom-format dump and verification.json. The script gives those rows
30 days from execution; obtain the owner's business approval for the production run.
CFP executed this only on development: ten rows, subsequent dry run zero.

## Storage, rate limiting and backups

- Private S3/R2 and presigned URLs remain pending. Current storage is local. Use a
  persistent encrypted volume outside the checkout, set the process environment
  `GSP_UPLOAD_DIR` to that directory, restrict filesystem access, and back it up.
  This storage setting is read from the process environment, not ignored dotenv extras.
- Avatar files remain private owner/admin reads. Service documents use authenticated
  attachment downloads, neutral names and no-store. Public derivatives are served only
  through the public image allow-list. Test cross-user denial after every storage change.
- Configure AWS/R2 credentials only when that storage integration is implemented;
  private buckets, scoped IAM permissions, encryption and short-lived signed reads.
  Do not represent the current local implementation as completed S3 support.
- Rate limits currently use one in-memory process. Use one API worker/instance for
  this implementation. Multiple workers or replicas need a shared store before scaling.
  Restarting clears the store. Record the configured windows, limits, lockouts and proxy
  count, and test Retry-After plus localized countdown behavior through the real ingress.
- Schedule encrypted custom-format PostgreSQL dumps and a consistent uploads backup.
  Keep copies outside the application host and OneDrive; set an owner-approved retention
  period. Verify `pg_restore --list` and perform restores into an isolated database and
  directory, then check row/file counts and a real private-document download. Record the
  restore time and outcome. Keep the Phase 0 backup until its owner approves retirement.

## Legal, accounts, logging and review

- The owner must supply reviewed English Terms and Privacy texts. For this deployment, the owner explicitly
  waived the Section 8 marker requirement on 2026-11-15: both markers were removed,
  while the documents remain drafting skeletons awaiting reviewed replacements.
  The startup guard still rejects PENDING_LEGAL_REVIEW if present. When replacing the
  drafting skeletons, bump LEGAL_VERSIONS and effective dates so development receipts
  cannot count as acceptance of a different final policy. Verify new consent receipts
  and the existing-user consent gate; backend-wide consent enforcement is out of scope.
- Have at least two individually assigned admins with separate credentials and no shared
  accounts. Verify roles in the database, rotate the seeded credentials privately, and
  deactivate accounts that should not have access. Test old tokens after deactivation.
- Send redacted structured/request-correlated application and ingress logs to a restricted
  destination. Choose and document a retention/deletion period with the owner. Avoid raw
  request bodies and Authorization headers at every layer, including the ingress.
  Verify deliberate failed login, validation and 500 traces contain no credentials or
  full email addresses. Use the returned X-Request-ID for incident correlation.
- Preserve audit logs as append-only application data. Recheck the OpenAPI audit registry,
  role matrix, XSS corpus, image metadata and private-file boundaries for every release.
  Run npm and Python dependency audits at release time and on a regular owner-assigned
  cadence, and after a relevant advisory. Record unresolved advisories and mitigation
  decisions; a passing build does not clear an advisory.

## Known gaps requiring future work

Tokens in sessionStorage and refresh tokens in JSON; no secure refresh-cookie design;
no antivirus document scan; no account deletion/export flow; no email password reset;
no backend-wide consent enforcement; local storage instead of S3/presigned URLs;
one-process limiter; reviewed legal texts and production credential
rotation still owner work. Realtime and payments are not implemented by this program.
