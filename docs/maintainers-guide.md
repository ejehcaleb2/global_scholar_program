# Maintenance recipes

Start with [AGENTS.md](../AGENTS.md), a clean task branch and the [runbook](runbook.md).
Programs, progress and evidence belong in ignored `.work/`; durable explanations belong here.

1. **Text:** edit [copy.json](../app/lib/copy/copy.json) without changing key structure.
   Read it with `useCopy` from [provider.tsx](../app/lib/copy/provider.tsx). Add no language switch.
2. **Color:** change the approved token in [globals.css](../app/app/globals.css),
   reference it through Tailwind, and inspect computed styles. New tokens need approval.
3. **Page:** read [app/AGENTS.md](../app/AGENTS.md) and installed Next documentation.
   Add a route under `app/app` and its feature under `app/components`; reuse its shell.
   Add dictionary copy and browser coverage for access, loading, empty/error and mobile states.
4. **API:** add Pydantic schemas and a domain router, register in
   [main.py](../backend/app/main.py), attach explicit access dependencies, and add an entry
   to [test_authz_matrix.py](../backend/tests/auth/test_authz_matrix.py). Test allowed/denied
   roles, ID ownership and private preview fields. Admin mutations write one audit row.
5. **Migration:** update [gsp_models.py](../backend/app/models/gsp_models.py); from `backend/`
   run project Python with `-m alembic revision --autogenerate -m "describe change"`.
   Review the new forward migration, test empty/existing scratch upgrades and `alembic check`.
   Never edit applied migrations. Back up real data before destructive upgrades.
6. **Seed record:** extend the appropriate function in [seed_data.py](../backend/scripts/seed_data.py)
   using stable natural keys. Preserve development guards and repeatability; test in isolation.
   Sample fixtures are not product claims.
7. **Admin screen:** use `components/admin/<domain>`, shared
   [admin primitives](../app/components/admin/ui), a guarded route, query hooks and copy.
   Include stale-edit handling, impact confirmation and API access checks.
8. **Test:** add backend cases under `backend/tests/<domain>` or browser specs under
   `app/tests/e2e/<area>`. Load isolated settings as shown in the runbook. From `backend/`,
   run `./.venv/Scripts/python.exe -m unittest tests.auth.test_password_policy`.
   From `app/`, run one browser file with `npm run e2e -- signup-admin-smoke.spec.ts`.
   Do not add sleeps, skips, retries or development-database shortcuts.
9. **Grant membership:** from `backend/`, inspect
   `./.venv/Scripts/python.exe scripts/grant_membership.py --help`.
   Supply `--email <student> --actor-email <admin> --plan beta --days 30 --dry-run`;
   review, then remove `--dry-run` deliberately. It grants/extends a dated membership
   and writes an audit entry. `create_admin.py` creates/promotes an administrator;
   `set_user_active.py` changes activation. Password input is private.
   There is no arbitrary operator password reset or email recovery. Signed-in users
   can change passwords; `seed_data.py --reset-passwords` affects development seed users only.
10. **JWT rotation:** securely back up settings, run
    `./.venv/Scripts/python.exe scripts/generate_secret.py` from `backend/`, restart
    the API and sign in again. Earlier tokens become invalid. Production keys belong
    in the host secret manager, never logs or Git.

## Admin editing and list contracts

Resource, opportunity, masterclass and homepage-post editors send the captured
`expected_updated_at` when updating a record. The API locks the row before
comparing versions and returns `409` with `stale_version` on a conflict. Keep the
editor's original version until the admin explicitly resolves that conflict;
background query refreshes must not silently authorize overwriting newer data.
The revision metadata for resources, opportunities and masterclasses is returned
by their admin response schemas, preserving the public response contract.

Admin content, student and service-request lists accept `paginated=true`, `limit`
and `offset`, returning `{items, total, limit, offset}`. Legacy array responses
remain available to existing callers. Content pages use one count and one data
query, with no per-record lookups. Keep filters and page state in the URL.

After admin mutations, invalidate the actual student query prefixes (`resources`,
`opportunities`, `masterclasses`, `courses`) as well as affected admin statistics
and audit queries. Reuse the shared lesson media renderer for preview and learners,
and shared drawers/dialog focus handling for editors and confirmations. These
updates synchronize on navigation, focus and reconnect; they do not add WebSockets.

`admin-controls.spec.ts` checks the ten admin lists against the control registry
and responsive widths. Extend it and the corresponding real interaction tests
when adding controls. `admin-repairs.spec.ts` covers authoring, publication,
preview media, conflicts, cache invalidation and failure recovery against the
isolated production frontend. Use request gates to inspect loading states;
never replace them with timed sleeps or force clicks around inaccessible controls.

## Large files retained intentionally

| File | Role |
|---|---|
| [copy.json](../app/lib/copy/copy.json) | Central English copy |
| [countries.json](../backend/app/core/countries.json) | Country reference/validation data |
| [gsp_models.py](../backend/app/models/gsp_models.py) | Related schema definitions, below 800-line split threshold |
| [seed_data.py](../backend/scripts/seed_data.py) | Guarded repeatable development fixtures |
| [test_content.py](../backend/tests/content/test_content.py) | Integrated content/access/progress regression cases |

These files exceed 500 lines; their content/logic was retained. The former 1,631-line
admin router is now domain modules with an ordered facade. Counts change with maintenance.

Recover removed historical files with
`git restore --source=archive/pre-cleanup-2026-11-07 -- <path>`.
### Lesson video playback

Learner lessons, saved previews and editor/version previews use VideoPlayer.
Provider SDKs load only when the player enters the viewport, inherit the page
script nonce and receive no application credentials. Frame sources remain
restricted to youtube-nocookie.com and player.vimeo.com; do not broaden that
policy to work around a provider redirect. YouTube API embeds carry the actual
page origin and both providers use strict-origin-when-cross-origin referrers.
Provider errors, rejected frames and bounded loading timeouts show recovery
controls. Retry recreates the player; the original-provider link stays available.

The server and editor URL parsers accept supported HTTPS watch, short, embed and
Shorts URLs and store only provider/id. Timestamp and playlist query parameters
do not become signed or expiring application URLs; playlist-only URLs are rejected.
Use the video-recovery browser regression for provider failure, timeout, refetch,
Vimeo compatibility and actual expired-token behavior. Its provider responses are
deterministic fixtures; real API content, authorization and persistence are not
mocked. For a real provider failure inspect its error and the saved ID separately
from authentication, and verify playback rather than relying on SDK readiness.
### Admin request workspace

Requests are reviewed from Needs attention on the admin dashboard or Requests
inside student details. The dashboard badge/statistic counts submitted and
in-progress requests; pending lists show the oldest first. Filters and pagination
use requests_status/requests_page, independently of the Students list page.
The student drawer uses the shared table's stacked presentation to avoid a wide
table in a narrow panel. Both contexts open the same request detail panel.

GET /admin/service-requests supports pending/user_id filters and paginated output.
GET /admin/service-requests/{id} returns document availability and eagerly loaded
status events/actors; both require admin access. Each read uses two data SELECTs
plus the authentication SELECT. Document download and status mutation APIs remain
unchanged; documents are downloads, and marking returned does not deliver feedback
or a reviewed file. Status updates lock the request row to prevent duplicate
concurrent transitions. Each successful mutation still writes one audit entry.

The old frontend queue route is removed. Its API authorization/ownership coverage
remains in the matrix and service tests. Keep Retry controls mounted while a
refetch is pending, so the shared Button can show progress; query pending status
alone would otherwise replace the clicked control with a skeleton.
# Settings editing

Profile and account pages share headings, sections and save indicators. Profile
comma-separated fields retain raw input until save; interest selection starts
from the displayed query data. Failed writes preserve the draft. Profile saves
and avatar uploads serialize to prevent conflicting cache updates. Security forms
also serialize, retain specific field errors and replace tokens after a password
change. Membership loading has an independent retry region and cannot hide the
email/password forms. Both existing settings routes are available in the settings
sidebar. Password reset, billing, export and deletion are not added by these forms.


## Homepage updates

Homepage posts are public editorial content: program announcements, practical
guides and updates. They are separate from the authenticated course curriculum.
In **Homepage posts**, write a title and a short card summary, then put complete
details in the rich-text body. Select meaningful words and choose **Insert link**
to add a full HTTP(S) destination. Unsafe schemes are rejected.

Save as a draft to keep it private, or publish to make its `/posts/<id>` page
public. **View post** opens the last saved published version in a new tab;
**Preview** checks unsaved edits. Pinning controls the homepage's three-card
selection and ordering. Unpublishing or deleting removes public access.

Only **Read more** opens the matching full publication. Its pending indicator
stays inside that link; the cover, title and overview remain visible.
Articles include a return link to the homepage updates section, optional image,
publication date and sanitized rich text. A temporary API failure offers Retry;
a missing or unpublished post shows a distinct unavailable state. Post mutations
invalidate public list/detail caches as well as admin lists, statistics and audit
queries. Existing focus/reconnect refetch behavior applies across sessions.

Regression coverage: `public/homepage-post-reading.spec.ts` exercises editor
links, image upload, draft privacy, publication, public navigation, external
destinations, unpublishing and error recovery. `admin/homepage-pin-flow.spec.ts`
covers pin ordering and deletion. Both run only through the isolated E2E wrapper.

Publications can contain up to 50 additional ordered sections: rich text, photos
with required descriptive alt text and optional captions, or supported HTTPS
YouTube/Vimeo videos. The opening text is optional when sections supply the
content. Use the move controls to reorder sections and the confirmation dialog
to remove one from the draft. Section actions remain local until Save; published
edits appear after Save. Draft preview uses the same PublicationContent renderer
as the public page. Direct video uploads are outside the current storage design.

Deploy the backend migration `f8b2c4d6e0a1` before the frontend: from the backend
root run `python -m alembic upgrade head` using the deployment database settings,
then start Uvicorn. This adds an empty JSONB sections array to existing posts; it
does not rewrite their text, covers or status. Keep applied migrations immutable.
On Render without Shell, include the migration in the service start command
(`python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`)
or use a supported pre-deploy command. Uploaded images still require persistent
backend storage; external video providers control embedding availability.

Publication validation is field-specific. Save highlights the exact text, photo
URL, photo description, video URL or caption that needs attention, names its
section, and focuses the first invalid input without clearing the draft. Photo
descriptions are required for accessibility; captions are optional. Text-only,
photo-only and video-only publications can publish without opening text.
