# Current project handoff

Active checkout: `C:\Users\DELL\OneDrive\Desktop\global-scholar`.
Do not switch to another copy without the owner's instruction.

## What exists

Next.js frontend and FastAPI/PostgreSQL backend with custom JWT authentication,
membership access, courses and progress, resources, opportunities, masterclasses,
review service requests, admin content tools and protected uploads. Operator
scripts for first admin, membership grants and activation already exist.

Cleanup removed archived docs/screenshots, generated output and proven unused
modules/dependencies. UI/API/query/test files are grouped by domain. Original
features, policy documents, public media and applied migrations are retained.
Alembic/model metadata now describes existing database constraints accurately;
no applied migration or database schema was edited for this repair.

## Running and checking

Use [README.md](README.md) and [runbook](docs/runbook.md). From root:
`powershell -ExecutionPolicy Bypass -File scripts/dev.ps1` starts two windows;
Ctrl+C stops each server. `scripts/verify.ps1` runs isolated serial gates.
Temporary program text/progress/evidence live under ignored `.work/`.
Durable knowledge is under `docs/`; recovery uses archive/pre-cleanup-2026-11-07.

Work is on chore/cleanup, starting from fix/onedrive-recovery. The cleanup
contract disallows automatic merge/tag from that starting branch. Nothing is pushed.
An optional slim export is a handoff artifact, never an automatic workspace switch.
The unverified `.kilo` worktree remains kept pending owner review.

## Open and next planned work (not authorization to start)

Validate/document operator workflows for deployment; build the missing migration-only
rehearsal and readiness verdict. Then separately scope admin user management,
shared categories/managers, masterclass registration, catalog/landing/profile redesign,
service review feedback/files, private S3 delivery, realtime and Paystack.
Operator scripts already exist; do not rebuild them based on old status text.
Email recovery, account deletion/export, cookie refresh and antivirus remain absent.
Reviewed legal text, HTTPS/hosting, persistent storage, credential rotation,
least-privilege DB permissions and restore proof require owner/host action.
No production-readiness claim follows from repository cleanup.
