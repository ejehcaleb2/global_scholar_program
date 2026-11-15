# Architecture

Public header, landing sections and footer use `lib/utils/layout.ts` for one
centered maximum width and responsive horizontal padding. Wide screens have a
maximum width rather than edge-to-edge stretching; text keeps its own readable
measure. Public navigation uses hover disclosures with click and keyboard
alternatives, Escape dismissal and 200ms ease-out motion. Reduced motion removes
the movement. Dropdown destinations are real landing section anchors, never
individual course links. Navigation labels have no chevron icons.
Hover and keyboard focus share a primary-color highlight and an animated
underline without changing the control's dimensions. Dropdowns fade and move
slightly over 200ms; reduced-motion users get stationary disclosures.
Resources, Opportunities and Services link to their existing routes rather
than adding overview rows to the landing page. Services retains its login
requirement. Section navigation waits for initial landing data and the mobile
header to settle before measuring the destination below the sticky header;
cross-page anchors and browser history use the same positioning helper.

The shared logo uses 56px in the public header/footer and 72px in auth/sidebar
contexts. Auth uses two desktop columns with a sticky, existing program photo;
smaller screens prioritize the form. The image enters briefly and respects
reduced motion. Password reveal has its own 44px column and cannot overlap text.

Explicit logout actions use the shared `components/auth/logout-button.tsx`
confirmation for student/admin sidebars (including profile-load failure) and
the consent screen. Cancel or Escape retains the session; confirmation clears
the existing auth/cache state and returns home. AppShellSwitcher owns the
logout redirect and unmounts protected children until it completes, preventing
page-level missing-session redirects from racing it. The shared dialog is portalled
above mobile drawers and contains/restores keyboard focus. Session expiry still
clears credentials automatically. The favicon derives from the existing GSP logo.

Next.js App Router/TypeScript, Tailwind 4 and local licensed fonts render the
interface. FastAPI owns JWT authentication, validation and authorization.
SQLAlchemy async sessions access PostgreSQL; Alembic owns schema changes.
The browser never connects to the database.

[Routes](../app/app) delegate to [feature components](../app/components).
Shared UI lives in `components/ui`, admin UI in `components/admin/ui`.
[API modules](../app/lib/api) and [TanStack Query hooks](../app/lib/queries)
are grouped by domain. Mutations invalidate affected keys; focus/reconnect
refetch replace realtime, which remains unimplemented.

Four student-facing contexts are marketing, app, course and settings. A separate
admin shell makes five `data-shell` values. Auth state selects marketing/app,
courses use curriculum navigation, profile uses settings, and admin uses a guarded
shell. Shared implementations are in [layout](../app/components/layout).

API requests pass through Pydantic schemas and authorization dependencies into
async sessions. Roles are student/admin. Paid access requires an active subscription
with a future non-null end date, checked from the database. Authentication rechecks
account activation and token invalidation. Public previews omit private links/bodies.
The [authorization matrix](../backend/tests/auth/test_authz_matrix.py) inventories operations.

Backend folders are [core](../backend/app/core), [dependencies](../backend/app/dependencies),
[db](../backend/app/db), [models](../backend/app/models), [schemas](../backend/app/schemas)
and [routers](../backend/app/routers). Admin handlers are split by domain;
[admin_content.py](../backend/app/routers/admin_content.py) preserves registration order.
Model metadata mirrors existing migration constraints. Applied migrations are immutable.

Storage is a private local abstraction. Uploads are sniffed and size limited;
images are re-encoded without metadata. Documents and avatars require owner/admin
access. Reviewed derivatives are in [public/media](../app/public/media); originals
and private uploads are ignored. `GSP_UPLOAD_DIR` is a process environment setting.
S3/presigned URLs and antivirus remain future work.

HTML is sanitized on write and through RichContent on render. Admin mutations
append one audit record per API call, including bulk calls. Audit logs have no
API mutation path. Lesson progress is authoritative; course summaries are recomputed.
Tokens remain in sessionStorage and refresh is returned in JSON; cookies are future work.

English copy is [copy.json](../app/lib/copy/copy.json), typed by
[dictionary.ts](../app/lib/copy/dictionary.ts), and read with `useCopy` through
[provider.tsx](../app/lib/copy/provider.tsx). There is no language switch.
[Policy documents](../backend/app/legal) retain review markers; the loader is
[core/legal.py](../backend/app/core/legal.py). Production requires reviewed text.
