# AGENTS.md: Global Scholars Program (GSP)

This file is the single source of truth for how you, the AI coding agent,
work in this repository. Read it fully before every task. If a prompt
conflicts with this file, this file wins, unless the prompt names the
specific rule it overrides.

Companion files:
- README.md: installation, folder layout and command entrypoints.
- docs/product-spec.md: product scope and open product questions.
- docs/architecture.md, docs/maintainers-guide.md and docs/runbook.md:
  durable architecture, maintenance recipes and operating instructions.
- SESSION_HANDOFF.md: narrative project state. It can lag behind the code.
  The repository and the database are the truth.
- app/AGENTS.md: Next.js rules. Read the Next.js documentation installed in
  app/node_modules/next before writing frontend code, because APIs differ
  between versions.

## 1. What this project is

GSP (Global Scholars Program) helps high-achieving secondary school students
in Cameroon prepare for and apply to universities abroad. Many users are
minors, so privacy and safety come before convenience. It combines:

- Courses (Course > Module > Lesson), authored by admins in a CMS, never
  hardcoded
- A Resource Database and an Opportunities Database
- Recurring live Masterclasses
- Two paid personalized services: Essay Review and Activities Section Review
- A membership model: free tier with limited access, paid tier with full
  access
- An admin panel for all of the above

The product is pre-launch. A 25-student closed beta is the first real test.
Build for that scale: correctness and security over optimization.

## 2. Tech stack (locked)

Do not substitute a framework, ORM, auth approach or styling system. If you
believe another tool is better, say so in the report and do not swap it in.

- Backend: FastAPI (Python 3.12+), REST API, in backend/
- Database: PostgreSQL through SQLAlchemy 2.0 (async), migrations with
  Alembic. Database name Global_scholar. There is no Supabase and no
  database-level RLS. If you find a reference to either, it is drift: report it.
- Auth: custom JWT auth in FastAPI (access and refresh tokens), passwords
  hashed with passlib/bcrypt. No bundled auth provider.
- File storage: target is private S3-compatible storage with short-lived
  presigned URLs. Current development storage is a local abstraction (see
  Section 16).
- Realtime: target is scoped FastAPI WebSockets. Not built yet (Section 7).
- Frontend: Next.js (App Router, TypeScript strict), Tailwind CSS 4,
  framer-motion, TanStack Query, lucide-react, Playwright, in app/. The
  folder app/app/ is the Next routing folder and is correct. The frontend
  never talks to the database.
- Design tokens: app/app/globals.css (Tailwind 4 @theme). Never hardcode
  color values elsewhere (Section 5).
- Validation: Pydantic on every request and response. Client-side checks
  mirror the server rules, and the server is always authoritative.
- Rich text: Tiptap on the frontend, HTML stored sanitized, sanitized again
  before render (Section 8).
- Hosting (target): frontend on Vercel, backend on Railway, Render or Fly.io,
  managed Postgres.
- Payments: not implemented. No Paystack code until explicitly instructed.

## 3. Designs

Screens from Google Stitch were structure and layout references only. For
new work, the written prompt and this file are the authority. Never invent
structure, content, statistics or claims that were not specified.

## 4. Process rules (read every time)

1. Scope. Work only inside the batch you were given. Do not scaffold or
   design for later batches.
2. Approval. An explicit step-by-step prompt is the approved plan. Do not
   wait for confirmation. Restate the scope in one line, then execute.
3. Ambiguity and conflicts. If a step is ambiguous, conflicts with the
   repository state, or the next action is destructive beyond what the
   prompt allows, mark that step BLOCKED, write the question in the
   evidence file and the final report, and continue only with steps that do
   not depend on it. Do not guess business logic, pricing, copy or data.
4. Stop at the end of the batch. The final report lists requested versus
   delivered item by item and ends with a compliance table (DONE, BLOCKED or
   DEVIATED per numbered step, each with an evidence pointer). A step marked
   DONE without evidence counts as not done.
5. Evidence means raw command output, API responses, SQL results, test
   output, computed style values or saved screenshots. Reading code is not
   evidence.
6. Commits. Small, logical commits with descriptive messages (feat:, fix:,
   test:, docs:, chore:). Do not add "per AGENTS.md" or check ids to
   messages and do not create commits that only record a ledger. Program text,
   progress, evidence and raw logs live in git-ignored .work/ and are never
   committed. Keep an evidence file under 800 lines. Durable knowledge goes
   in docs/; browser artifacts stay in ignored app/test-artifacts/.
7. Progress. One-line progress messages while working. Keep
   .work/<batch>-progress.md as a checklist and commit after each phase. On
   start, read the progress file and continue from the first unchecked step.
8. Secrets. Never print passwords, tokens, hashes, .env contents or seed
   credentials. Redact tool output. Prefer targeted greps over broad file
   dumps.
9. Test data. Use the batch prefix, delete it at the end with real counts,
   and leave seed data intact.
10. Out-of-scope findings go in the report, not into the code.

## 5. Design system

These are hard rules because generic AI design defaults (gradients, random
accents, oversized radius) creep in unless constrained. Define values once as
tokens in globals.css and reference them. Never approximate a hex value and
never let a component define a one-off color.

Core tokens:

```
--color-primary:      #0056E2   headings, links, primary buttons, active
                                states, focus rings
--color-background:   #FFFFFF   primary page background, always
--color-surface-alt:  #F7F8FA   secondary panels only
--color-text:         #333333   body text, never pure black
--color-border:       #E0E0E0   default input and card borders
```

- Semantic colors verified in globals.css: success uses --color-status-success;
  in-progress uses --color-primary; neutral uses --color-text, --color-border
  and --color-surface-alt. Errors use --color-red-600 (text) and --color-red-200
  (borders), provided by the Tailwind import in globals.css and verified in
  computed production CSS. Use existing tokens; adding a new one means BLOCKED
  and ask.
- Fonts: headings serif (Fraunces), body sans (Source Sans 3). No other
  families. Fonts are self-hosted with next/font/local, latin/latin-ext files
  and OFL licenses in app/app/fonts, CSS variables --font-heading/--font-body,
  swap and adjusted fallbacks. Source Sans 3 includes the used italic style;
  production builds require no font network access.
- Type minimums: body text 16px or more, secondary text and table headers
  13px or more, nothing smaller. Use a short fixed set of sizes.
- Radius: 8px everywhere. rounded-full only for avatars, toggles and count
  badges.
- Shadows: none on cards, tables and buttons. One shared elevation token is
  allowed on dropdowns, popovers, dialogs, drawers and toasts only.
- Icons: lucide-react at 16px and 20px. No emoji as icons.
- Motion: 150 to 250ms ease-out on every interactive element. The hero
  crossfade is the single exception (500ms ease-in-out). Respect
  prefers-reduced-motion.
- Forbidden: gradients, glassmorphism, blur, glowing shadows, purple, indigo
  or teal accents, parallax, decorative shadows.
- A UI pattern not covered here means BLOCKED and ask, not invent.

## 6. Roles and access control

Two stored roles (student, admin) plus a membership tier derived from
subscriptions give four access levels. The FastAPI backend is the
enforcement boundary: every endpoint checks authorization through a
dependency (for example require_admin, require_paid). Hiding something in the
UI is never enough.

| Access level | Can see | Can change |
|---|---|---|
| Guest (no login) | Marketing pages, previews (below) | Nothing (can sign up) |
| Free Member | Guest content, free courses and resources, the 4 soonest opportunities, free masterclasses | Own profile |
| Paid Member | Everything a Free Member sees, plus all courses, resources, opportunities, masterclasses, and service requests | Own profile, own service requests |
| Admin | Everything | All content, all student records, the service request queue |

Guest preview contract. For resources, opportunities and masterclasses a guest
receives preview fields only: id, title or name, category, a description
truncated to 160 characters, deadline and computed status (opportunities),
session date and speaker (masterclasses), and locked: true. A guest never
receives a resource url, external_link, session_link, recording_url or any
body. A guest list contains the same items a Free Member would see
(resources: free items only; opportunities: the same 4; masterclasses: all,
all locked). Course catalog summaries are public. Course detail and lessons
require login.

Membership rule. A subscription grants paid access only when status is
active AND current_period_end is set AND is in the future. This applies to
every plan, including beta. One shared function or SQL criterion implements
it, and every access check uses it. Admin-granted memberships always set an
end date. Until the admin interface exists, the operator script
grant_membership.py grants them (Section 17).

Schema decisions:
- users.role (student or admin) lives on users, separate from membership and
  separate from profiles. The profile row is created at signup and onboarding
  fills its education and interest fields. Never derive role from membership.
- subscriptions: plan (extensible: beta, monthly, later annual), status
  (active, expired, canceled), current_period_end (drives access, see above).
  Beta students are plan = beta, not a separate table.
- access_type (free or members_only) exists only on courses, resources and
  masterclasses. Opportunities have no access_type: the free-tier cap is
  enforced in the query (soonest 4 deadlines). Opportunities and masterclasses
  currently have no publication status column (Section 16).
- lesson_progress is the source of truth (one row per student per lesson).
  course_progress is a denormalized summary, recomputed when a lesson is
  completed or uncompleted and also when lessons are added, removed or moved.
  Percentages come from live lesson counts.
- service_request_events logs every status transition (request, from, to,
  changed_by, changed_at).
- consents (user_id, consent_type, version, accepted_at) is its own table:
  terms, privacy, and later case-study consent as separate rows.
- audit_logs records every admin content mutation: who, what, when. The audit
  log is immutable through the API. One admin API call writes exactly one
  entry. A bulk operation (reorder, bulk delete) writes one entry whose extra
  data lists the affected ids.
- Admins and students are both rows in users. Profiles hold personal data,
  never roles.
- Guardian accounts are out of scope, but nothing in profiles may assume a
  standalone account only.

Rules:
- Read the membership tier from the database on every request that gates
  content. Never trust a role or tier claim from the client or from a JWT
  alone.
- Check is_active and token_valid_after from the database on every
  authenticated request.
- Every admin mutation depends on an explicit admin check on that route.
- Every route has an entry in the authorization matrix test (Section 8), and
  every role boundary has at least one passing and one denied test. A locked
  response must be limited by the API itself, not hidden by the frontend.

## 7. Realtime (target, not built)

Target: scoped FastAPI WebSockets, authenticated with the same JWT on
connect, scoped so a free-tier connection never receives events about content
it cannot access. Events: publishing content, service request status
changes, live progress across tabs.

Current behavior until this is built: queries refetch on window focus and
reconnect, mutations invalidate affected keys, and the admin pending-request
badge refreshes about every 60 seconds while visible (Section 11).

## 8. Security requirements

- Input validation. Every request is validated by Pydantic regardless of
  frontend checks. Normalize emails (trim, lowercase).
- Secrets. Environment variables only, never committed. APP_ENV is
  development, test or production (default production). JWT_SECRET is
  required, at least 32 characters, and a deny-listed placeholder is
  rejected at startup. In production the app refuses to start with weak
  configuration, localhost CORS origins, or legal documents that still carry
  the PENDING_LEGAL_REVIEW marker. Nothing secret reaches the frontend bundle.
- Tokens. Access tokens are short-lived JWTs. The decoder pins the allowed
  algorithm from settings (never from the token header) and requires exp,
  iat, sub, jti and type. Endpoints reject tokens of the wrong type. A token
  issued before users.token_valid_after is rejected. Changing a password sets
  token_valid_after and returns a fresh pair so the current device stays
  signed in. Target storage for the refresh token is an httpOnly cookie
  (Section 16).
- Passwords. bcrypt via passlib. Length 10 to 72 bytes, not in a built-in
  list of common passwords, not containing the email local part or the
  user's name, no composition rules. Login does the same bcrypt work for
  unknown emails and returns the same message and status, so timing and
  responses do not reveal which accounts exist. Email is unique on
  lower(email).
- Rate limiting. Login, signup, refresh, password change, email change and
  uploads. Many Cameroonian users share one IP through mobile carriers and
  school networks, so per-IP limits are generous flood guards and per-account
  limits do the real work. A 429 returns {"detail": {"code": "rate_limited",
  "retry_after": seconds}} and a Retry-After header. The client IP comes from
  the socket unless TRUSTED_PROXY_COUNT is set. Limits are configurable and
  cannot be disabled in production. The in-memory store works for one process
  only.
- Uploads. Allow-list by sniffed magic bytes, never by client filename or
  Content-Type. Explicit size limits. Storage keys are server-generated.
  Images are re-encoded with all metadata removed (EXIF, GPS, XMP, comments),
  EXIF orientation applied, and pixel limits enforced. Documents are served
  as downloads only with a neutral filename, nosniff, private and no-store,
  to the owner or an admin. Avatars are visible to the owner and admins only.
- HTML. One renderer (RichContent) renders stored HTML. Content is sanitized
  against an allow-list on write and again on render. dangerouslySetInnerHTML
  is allowed only inside RichContent and a lint rule enforces it. The XSS
  corpus test runs against every rich-text field.
- Headers. The backend and the frontend set X-Content-Type-Options,
  Referrer-Policy, frame denial and a Content-Security-Policy (nonce based,
  with frame-src limited to youtube-nocookie.com and player.vimeo.com). The
  API docs are disabled when APP_ENV is production.
- Logging and errors. Every request gets an X-Request-ID. Logs redact
  Authorization values, passwords, tokens, JWT-shaped strings, and mask email
  addresses. Validation errors (422) return only loc, msg and type, never the
  submitted input. Unhandled errors return 500 with a generic message and the
  request id.
- CORS. Explicit allow-list from an environment variable, no wildcard,
  explicit methods and headers, allow_credentials false until a cookie design
  exists.
- Consent and legal. Signup requires accepting the Terms and the Privacy
  Policy, recorded as consents rows with versions. Legal documents are
  versioned files in the single interface language (folder set by LEGAL_DIR,
  default backend/app/legal). Never invent legal claims: placeholders stay marked until
  the owner supplies reviewed text. Users under 18 see a guardian notice.
- Audit. Admin actions that change content, status or access are logged
  (Section 6).
- No payment data ever touches our database.
- Dependencies. Lockfiles are tracked and Python requirements are pinned.
  Run npm audit and pip-audit before each release. A package with a high or
  critical advisory must be upgraded, including a bump of an exact pin within
  the same major version, with every gate passing. Never run npm audit fix
  --force.
- Authorization tests. A matrix test lists every API operation with an
  explicit expectation (public, auth or admin) and fails when an operation
  has no entry. Run it for guest, free, paid, admin and deactivated personas.
  Public routes never return 403 and never return 401 for a request that has
  no token or a valid one. The only allowed 401 on a public route is a wrong
  credential on a credential endpoint (login, refresh) or an invalid, expired
  or deactivated-user token on an optional-auth route. Each such exception is
  listed with its reason inside the test. Ownership (IDOR) tests cover every
  route that takes an id.

## 9. Content and data rules

- Never invent statistics, accreditation claims, partner counts or
  testimonials. If real content is missing, show an explicit empty state or
  ask.
- Course content model: Course > Module > Lesson. A lesson has a rich text
  body, optional duration, optional video (YouTube or Vimeo, stored as
  provider and id), optional resource links, and an optional "Try it
  yourself" prompt shown as an unsaved reflection box that never blocks
  progress. All modules and lessons are open to anyone with course access.
  Sequential locking was cut from scope.
- Opportunity status (Open, Expiring Soon, Expired) is computed from the
  deadline, never set by hand.
- The free-tier opportunity cap is a SQL limit, not a UI truncation.
- Language: the interface is single-language (English). There is no
  translation feature, language toggle, language cookie or per-account
  language setting, and none may be added without an explicit decision. All
  user-visible text lives in app/lib/copy/copy.json, typed by dictionary.ts
  and read through CopyProvider/useCopy in app/lib/copy/provider.tsx,
  so wording is edited in one place. Do not
  invent or machine-translate content.

## 10. Definition of done

Before reporting a batch complete, paste the real output of:
- npm run lint (0 warnings)
- npx tsc --noEmit
- npm run build
- npm run e2e (isolated, Section 15)
- from backend/, the unit tests (Section 14)

All must pass. In addition: authorization tests exist for every new route
(one allowed, one denied), no hardcoded colors or fonts outside the tokens,
no invented content, new behavior has tests, and every item of the prompt is
accounted for in the compliance table.

## 11. UI interaction and quality standards

- Buttons. Use the shared Button component everywhere. It owns loading and
  disabled behavior, stable dimensions, aria-busy and reduced-motion-aware
  progress. A lint rule forbids a native button elsewhere. Navigation buttons
  show a pending state and ignore double clicks.
- Every async region has a skeleton, an empty state, a no-results state where
  filters exist, and an error state with Retry. Every mutation shows a
  success or error toast. Copy is specific and actionable, never generic.
- Rendering. The first render must be deterministic on server and client: no
  localStorage, window, Date.now or locale-dependent formatting during
  render, and no hydration-warning suppression except the single root exception below. Times render a stable value first and switch to
  local or relative text after mount (LocalTime, useHydrated).
- Root hydration exception: suppressHydrationWarning is allowed on RootLayout's
  <html> element only, for the verified external focus-visible attribute/class
  mutation (Loom for Edge). Never suppress warnings on body or descendants. The
  isolated guard must still fail on every other hydration mismatch, console
  error or CSP violation.
- Data fetching: Section 12. Shared query defaults refetch on window focus
  and reconnect. Logout or a user change clears the cache.
- Copy. Every user-visible string, aria-label, tooltip, toast and mapped
  error comes from the central copy dictionary. Dates and numbers use Intl
  with the single app locale constant.
- Images. Use next/image through the shared MediaImage component. The one
  exception is the shared Avatar component, which fetches protected avatars
  with an Authorization header and renders a blob URL (unoptimized), with
  initials as the fallback.
- Accessibility. Labels tied to inputs, visible focus, dialogs trap focus and
  close on Escape, role="alert" on form errors, aria-expanded on expandable
  sections, keyboard reachability, muted text contrast of at least 4.5:1,
  tap targets of at least 40px on mobile, and no horizontal page overflow at
  390, 768, 1024, 1280 and 1440 px.
- Shells. The shell is chosen by auth state, never by route: guests get the
  marketing shell; logged-in users get the sidebar app shell (no marketing
  nav, no footer, profile block at the bottom of the sidebar); inside a
  course the sidebar becomes the curriculum tree; /profile uses the settings
  sidebar; /admin uses the admin shell. Shell roots carry data-shell
  (marketing, app, course, settings, admin). Header, footer, logo and sidebar
  primitives exist once and are never copied.

## 12. Performance and data fetching (binding)

- All server data goes through React Query hooks. Student hooks live in
  app/lib/queries/ (namespaced keys in queryKeys, cache policy in STALE).
  Raw useEffect plus fetch plus local loading state is not allowed for server
  data. Shared data (profile, membership, course detail) uses one shared hook.
- Choose staleTime by how often data changes. Skeletons appear only while
  pending with no cached data. Mutations update or invalidate every affected
  key.
- Independent requests run in parallel. Only genuinely dependent requests
  wait, with a comment saying why.
- Backend endpoints that return nested or related data use eager loading and
  grouped aggregates, never per-item queries in a loop. Caps are SQL limits.
  Report the query count for any new or changed list endpoint.
- Internal navigation uses next/link. router.push is for redirects after an
  action.

## 13. Admin panel conventions

- Admin routes use the admin shell and a server-side guard: a guest goes to
  /login?next=<path> (same-origin relative paths only), a non-admin sees a
  branded 403 page. The API remains the real boundary.
- Build pages from the shared primitives: AdminPageHeader, DataTable,
  StatusBadge, SwitchToggle, ConfirmDialog (typed confirmation for destructive
  actions with learner impact), EmptyState, StatCard, FormField,
  SaveStatusIndicator, StaleChangeDialog. Extend them, never copy them.
- Page pattern: an overview or list first, details on a separate page or
  drawer, never every control on one screen. Filters and pagination sync to
  the URL. Tables paginate on the server.
- Edits send expected_updated_at and handle 409 with StaleChangeDialog.
  Destructive actions show their real impact first.
- Every mutation writes one audit entry with a label and field changes
  (short scalar fields only, never secrets or long text content).
- No dead controls: a control without working behavior does not exist. No
  fabricated names, numbers or dates.
- Service requests are reviewed in the dashboard's Needs attention workspace
  and the Requests section of student details, with a shared detail panel.
  There is no standalone admin queue page. Keep the existing student Services
  feature, document/status APIs, their authorization coverage and audit history.

## 14. Repository workflow and hygiene

- The trunk is master, not main. Start from a clean git status and use a task
  branch (feature/<name>, fix/<name> or chore/<name>). If the tree is dirty at
  the start and the prompt does not name the dirty files, mark the first step
  BLOCKED and report.
- Never rewrite history, force push, delete branches, or commit generated
  output. Merge with a normal merge commit only after every gate in Section 10
  passes, then tag known-good-<date> (add -2, -3 if the name exists, never move
  an old tag). Push only when explicitly requested.
- Build and dev output goes to .next. Only isolated browser tests use
  .next-e2e through NEXT_DIST_DIR. Keep no worktrees inside this project.
  Ignore .next*, node_modules, test-results, playwright-report,
  test-artifacts, Python caches, tsbuildinfo, local env files (.env,
  .env.e2e, .env.seed, seed credentials), uploads and the Media originals.
  Reviewed public media derivatives and authored source and docs are
  deliberate assets and may be committed.
- Browser screenshots, traces and logs go to ignored app/test-artifacts/.
  Tests never overwrite tracked screenshots.
- Backend tests run from backend/ with the project virtual environment:
  .\.venv\Scripts\python.exe -m unittest discover tests. Not the system
  Python and not pytest. Select the isolated test database through
  environment variables and never print them.
- Windows PowerShell mangles multi-line python -c strings: write a temporary
  .py file instead. A running uvicorn does not pick up changes unless it runs
  with reload. localhost and 127.0.0.1 are different CORS origins. Deleting a
  user is blocked by audit rows (RESTRICT on purpose), so cleanup scripts
  delete test audit rows first. The Next.js dev indicator badge is not app
  content. Playwright fullPage screenshots misplace sticky elements.
- Database and upload backups for destructive steps go to
  C:\gsp-backups\ (outside OneDrive).

## 15. Isolated browser tests

Run npm run e2e from app/. The wrapper prepares the fixed Global_scholar_e2e
database, generates credentials into the ignored root .env.e2e, and refuses
conflicting URLs or database settings. Global setup resets only an _e2e
database. The backend runs on 127.0.0.1:8101 and the production frontend on
127.0.0.1:3101. Both webServer entries forbid server reuse. Uploads use an
isolated temporary folder. Teardown removes extra test rows and uploads,
verifies cleanup and preserves seed fixtures. Specs wait on explicit
conditions (register response waits before the action, never after). Fixed
sleeps, loosened assertions, blanket retries and skipped tests are not
allowed. Never point browser specs at the development database or at ports
3000 and 8000. The hydration guard spec fails on any hydration warning or
CSP violation across all routes.

## 16. Implementation status (update the row in the same commit that changes it)

Status values: Not implemented, Partial, Implemented (with evidence in the
ignored batch evidence file). Historical CFP evidence is recoverable from
archive/pre-cleanup-2026-11-07; current verification is in docs/runbook.md. Other rows retain
the owner-provided status until their authorized verification/change.

| Area | Target | Status |
|---|---|---|
| Private S3 storage with presigned URLs | Section 2 | Not implemented (local development storage behind an interface) |
| Refresh token in httpOnly cookie | Section 8 | Not implemented (access token and user in sessionStorage, refresh token in JSON) |
| Strong JWT secret enforcement, APP_ENV | Section 8 | Implemented (CFP configuration validation and local rotation) |
| Token claims, token type checks, token_valid_after | Section 8 | Implemented (CFP claims and DB-backed invalidation tests) |
| Rate limiting | Section 8 | Implemented (CFP boundary and lockout tests; one process only) |
| Password policy, login timing equalization, unique lower(email) | Section 8 | Implemented (CFP policy, timing and reversible migration tests) |
| Consent capture and legal documents | Section 8 | Implemented (CFP versioned capture/pages; owner legal review pending; owner Section 8 deployment exception removed draft review markers on 2026-11-15) |
| Image metadata removal (avatars, public media) | Section 8 | Implemented (CFP decode/reencode and stored-file verification) |
| Single HTML renderer and lint guard | Section 8 | Implemented (CFP shared renderer and XSS corpus) |
| Security headers and CSP | Section 8 | Implemented (CFP enforcing nonce CSP; 234 visits, zero findings) |
| Log redaction, 422 without input echo, request id | Section 8 | Implemented (CFP HTTP and captured-log tests) |
| Guest preview contract | Section 6 | Implemented (CFP API and browser checks) |
| Membership rule applies to beta plans | Section 6 | Implemented (CFP shared criterion and backfill) |
| Audit: one entry per admin call, coverage test | Section 6 | Implemented (CFP 30 operations; 34 calls, 34 audit rows) |
| Authorization matrix test | Section 8 | Implemented (frontend UX 83 operations, 415 role decisions plus eight token cases; exception data/reasons and negative mutation proof) |
| Realtime | Section 7 | Not implemented |
| Payments | Section 2 | Deferred by decision |
| Email password reset | Section 8 | Not implemented (RRP removes dead link; availability text only, no reset flow) |
| Account deletion and data export | n/a | Not implemented |
| Antivirus scanning of uploads | n/a | Not implemented |
| Shared categories for resources and opportunities | planned | Not implemented (free text per table) |
| Publication status for opportunities and masterclasses | planned | Not implemented |
| Masterclass registration | planned | Not implemented |
| Service feedback, notes, revisions, reviewed files | planned | Not implemented (status changes only) |
| Admin user suspension, last login, membership grants | planned | Not implemented |
| Fonts self-hosted, no build-time network | Section 5 | Implemented (RRP invalid-proxy build, real loaded families, no Google requests, CLS below 0.1) |
| Operator scripts: create_admin, grant_membership, set_user_active | Section 17 | Not implemented |
| Production advisories on the pinned Next.js version | Section 8 | Implemented (RRP exact 16.4.3 pins; production audit zero; 16 moderate dev-only toolchain entries documented) |
| Single-language interface | Section 9 | Implemented (switching removed; RRP snapshots, field migration and single-language tests) |
| Lesson video loading and recovery | Section 9 | Implemented (shared learner/admin player, provider error and timeout recovery, explicit referrer/origin, Shorts parsing; frontend UX evidence) |
| Admin request workspace | Section 13 | Implemented (dashboard/student panels, existing document downloads/transitions, real status history; frontend UX API/browser evidence) |
| Profile and account settings | Section 11 | Implemented (shared save states, safe drafts/discard, contextual navigation, inline account validation, independent membership recovery; frontend UX browser evidence) |
| Logout confirmation | Section 11 | Implemented (shared student/admin/consent confirmation, cancel/Escape/focus containment, coordinated home redirect and session cleanup; logout confirmation evidence) |
| Public navigation and layout | Section 11 | Implemented (centered responsive width, shared logo/footer, animated hover/focus, chevron-free section navigation after layout readiness, direct resource/opportunity/service routes; landing navigation browser evidence) |
| Homepage editorial posts | Section 9 | Implemented (Read more opens matching publications; ordered text/photo/video sections, shared draft preview, secure links/uploads and load recovery; homepage-posts evidence) |

## Repository layout and scripts

- app/app/: Next route wrappers, metadata, local fonts and global tokens.
- app/components/: ui/, layout/, feature folders and admin/ui/ plus admin domains.
- app/lib/: api/ and queries/ split by domain; copy/ and utils/.
- app/tests/e2e/: public/, student/, admin/, security/, accessibility/ and helpers/.
- backend/app/: core/, dependencies/, db/, models/, schemas/, routers/ and legal/.
  The legal loader is core/legal.py; policy text stays in legal/.
- backend/tests/: auth/, admin/, security/, legal/, content/, profiles/,
  services/, media/ and operations/; discovery starts at tests/.
- backend/alembic/: immutable applied versions and the migration environment.
- backend/scripts/: operational and fixture tools, including create_admin.py,
  grant_membership.py, set_user_active.py, generate_secret.py, e2e_db.py,
  check_production_config.py, backfill_subscription_ends.py and cleanup_test_data.py.
- app/scripts/: frontend build/media and isolated browser-test tools.
- scripts/dev.ps1: start this checkout; scripts/verify.ps1 and verify.py: serial gates.
- docs/: durable knowledge. .work/: ignored program text, progress, evidence and logs.

Use the owner-selected checkout C:\Users\DELL\OneDrive\Desktop\global-scholar.
Do not switch folders because an export or another project copy exists.

## 17. Production readiness

A release is ready only when docs/production-readiness.md exists, is current,
and every check in it is backed by evidence. The verdict is one of: READY,
READY FOR CLOSED BETA WITH CONDITIONS, NOT READY.

- Blockers (P0): data exposure, access-control bypass, data loss, a failed
  core journey, a dead link on a primary page, a console error or CSP
  violation on a core page, a critical or high advisory without a fix, a
  migration that fails from an empty database, no way to create the first
  admin or grant a membership. Any open blocker means NOT READY.
- Conditions: actions only the owner or the host can perform (reviewed legal
  text, hosting with persistent storage, HTTPS, backups and a restore test,
  credential rotation, a least-privilege database role). Each condition names
  who does it and how it is checked.
- Accepted risks are named with a reason and a trigger to revisit them.
- Rehearsal. npm run rehearsal (from app/) builds the production frontend and
  runs it against a scratch database created from migrations only (no seed),
  bootstraps the first admin with the operator script, and exercises the real
  user journeys through a browser. It never touches the development or e2e
  databases.
- Operator scripts in backend/scripts: create_admin.py (first admin or
  promotion), grant_membership.py (beta or monthly access with an end date),
  set_user_active.py (deactivate or reactivate). They read passwords from a
  prompt or the environment, never print secrets, enforce the password policy,
  and write an audit entry.
- Things only a real deployment can prove (HTTPS, HSTS,
  upgrade-insecure-requests, host environment variables, persistent storage,
  restoring a backup) go into a post-deploy checklist inside the readiness
  document.
