# Global Scholars Program (GSP) — Project Brief

This document is the product specification for GSP. AGENTS.md defines
*how* to build (engineering rules, security, design system); this file
defines *what* to build. Read both before starting any work.

## 1. What GSP is

GSP is a platform helping high-achieving secondary school students in
Cameroon prepare for and apply to international universities. Students
currently struggle to find reliable, structured information about
university admissions, scholarships, and global opportunities, and
often can't access affordable, credible guidance. GSP centralizes
admissions knowledge, skills training, curated opportunities, and
personalized support in one platform.

Target users: high-achieving Cameroonian secondary/high school
students (and to a lesser extent their parents/guardians) pursuing
undergraduate, master's, or PhD study abroad, scholarships,
internships, fellowships, or research opportunities.

## 2. Business model

- **Membership:** $17 USD/month for full platform access
- **Free tier:** limited access — selected courses, selected resources,
  up to 4 opportunities visible at any given time, selected
  masterclasses, and community access. This is a query-level limit on
  the free tier, not a UI truncation of full data.
- **Paid services** (see Section 6): purchased separately from
  membership, per request.

## 3. Rollout plan

- **Closed beta:** 25 students, 1 month, flat fee of 20,000 FCFA per
  student (this is a one-time beta access fee, not the standard
  monthly membership price). All 25 beta students get full access —
  there is no free tier represented in the beta cohort itself, even
  though the free-tier system should still be built as part of the
  access-control model for the eventual public launch.
- **Pilot:** 100 students, 3 months, incorporating feedback from the
  beta before adjusting product or pricing further.

## 4. MVP scope — what to build vs. what to defer

This is the authoritative scope. Do not build anything outside this
list without being asked, even if it appears elsewhere in this
document as a longer-term idea.

### In scope for MVP/beta

- Account creation, profile, and onboarding (Section 5)
- Three courses only: **Foundations**, **Essay Writing Lab**, **SAT
  Prep & Strategy** (Section 6), structured as **Course → Module →
  Lesson** (a simplified two-level nesting under Course — not the
  deeper Module → Unit → Topic structure sometimes referenced in
  early planning; that was intentionally collapsed for buildability)
- Admin Course Editor (CMS) — admins author lesson content (rich text,
  links, an optional "Try it yourself" reflection prompt) and publish
  it; nothing about course content is hardcoded
- Simple progress tracking: mark-lesson-complete, per-course progress
  bar. No quiz-gated/progressive unlocking logic in MVP
- Resource Database: admin-curated only (no student submissions in
  MVP), searchable/filterable
- Opportunities Database: admin-curated, searchable/filterable, with
  automatically computed status (Open / Expiring Soon / Expired) based
  on deadline, and the 4-item free-tier cap
- Masterclasses: scheduled list with speaker, date, and a join link
  (Zoom/Meet/YouTube) — no custom video infrastructure. Public page
  shows free-preview vs. members-only sessions; student view shows
  join/recording links.
- **Two paid services only:** Essay Review and Activities Section
  Review, via a request form (document submission) with a status
  workflow: Submitted → In Progress → Returned, and an admin queue to
  manage requests
- Payment and membership-status gating (Paystack integration deferred
  — see AGENTS.md Section 2 — but the access-control model should be
  built to support it)
- Student Dashboard summarizing progress, latest opportunities,
  upcoming masterclasses, and service request status
- Admin panel: Dashboard, Homepage Content (CMS) manager, Course
  Manager, Resource Manager, Opportunity Manager, Masterclass Manager,
  Service Request Queue, Student/Member Management, Settings
- Community: a WhatsApp group, linked from the platform. No in-app
  chat is built in MVP.

### Explicitly deferred (do not build without new instruction)

- Skills Immersion course (Academic Writing, Research, Public
  Speaking, Entrepreneurship, etc.) — general life-skills content, not
  core to the admissions-guidance value proposition
- In-app real-time chat/community — WhatsApp covers this for now
- Student-submitted resources and any moderation workflow for them
- All paid services beyond Essay Review and Activities Section Review:
  Live Essay Review, SAT Practice Test Review, Office Hours, Full
  Application Support, and any others mentioned in early planning
- A dedicated application/deadline tracker tool
- Quiz-gated/progressive module unlocking
- The deeper 4-level course hierarchy (Module → Unit → Topic) — the
  simplified Course → Module → Lesson structure is final for MVP

## 5. Signup and profile fields

**At account creation (required):**
- Full name
- Email
- Date of birth
- Country of residence
- Password
- Terms of Service and Privacy Policy acceptance

**At account creation (optional):**
- Phone number

**Onboarding (immediately after signup, 3-step flow):**
1. *Profile:* education level (High School / Undergraduate / Graduate
   / Other), school, city
2. *What brings you to GSP* (multi-select): undergraduate applications,
   master's applications, PhD applications, scholarships, SAT,
   internships, fellowships, research, other
3. *Interests:* field(s) of study (multi-select/tag input), country/
   region(s) of interest (multi-select/tag input)

**Consent (separate from general Terms acceptance):**
- Terms of Service + Privacy Policy acceptance (required)
- A distinct, separately-worded opt-in for "GSP may use my essay/
  application materials as an anonymized case study" — must not be
  bundled into the general ToS checkbox

## 6. Courses (MVP set)

1. **Foundations** — Understand how global admissions works, from
   financial aid to application systems. Modules include:
   Understanding Global College Admissions, Scholarships & Financial
   Aid, Application Systems, Standardized Tests & Academic
   Requirements, Application Strategy.
2. **Essay Writing Lab** — Develop compelling, authentic university
   application essays.
3. **SAT Prep & Strategy** — Learn how to strategically prepare for
   and approach the SAT.

Each course is Course → Module → Lesson. Each lesson has a rich-text
body authored by an admin and an optional "Try it yourself" reflection
field (ungraded, free text).

## 7. Resources and Opportunities

- **Resource Database:** SAT resources, successful essays, African
  application case studies, how-to guides. Admin-curated. Searchable
  and filterable by category.
- **Opportunities Database:** currently open scholarships, programs,
  competitions, and activity-building opportunities. Admin-curated,
  with a deadline field driving an automatically computed status
  (Open / Expiring Soon / Expired). Free-tier students see a maximum
  of 4 opportunities at any given time; paid members see the full
  database.

## 8. Masterclasses

Recurring live sessions. Fields: title, speaker, description, date/
time, session link, access level (Free preview or Members Only), and
an optional recording link added after the session. Examples from
early planning: "Winning the Application Process" (Sir Allen), "Having
a Consistent Application Narrative" (Mohammed), "Alumni Story"
(Divina), "Group SAT Review" (GSP Team).

## 9. Services (MVP: two only)

1. **Essay Review** — written feedback on an application essay
2. **Activities Section Review** — feedback on how extracurricular
   activities/achievements are presented

Both work via: student submits a document → request enters queue
(Submitted) → admin marks In Progress → admin returns feedback
(Returned). Pricing is not hardcoded in MVP UI (shown as "pricing
available at checkout" until Paystack is integrated).

## 10. Admin/CMS capabilities

Admins can create, edit, publish/unpublish, and delete: homepage
featured posts, courses (and their modules/lessons), resources,
opportunities, and masterclasses. Homepage featured posts support a
draft/published status and a "pin" flag (max 3 pinned at once); if
nothing is pinned, the homepage falls back automatically to the 3 most
recently published posts. Admins can also view/manage the service
request queue and the student/member list, and adjust basic settings
(admin profile, notification preferences, the homepage pin limit).

## 11. Open questions (unresolved — do not assume answers)

- Verification process for opportunities before publishing
- How frequently the Opportunities database is refreshed, and how
  expired opportunities are archived vs. just marked Expired
  automatically
- Formal process for obtaining permission to publish student essays/
  case studies (beyond the signup-time consent checkbox in Section 5)
- Who fulfills Essay Review and Activities Section Review requests,
  and expected turnaround time
- Which payment methods to support at public launch beyond the beta's
  manual/CamPay-or-Flutterwave-style flow
- Whether memberships will support longer-term plans beyond monthly,
  and what happens on expiration/cancellation
- Whether parents/guardians can purchase memberships or services on a
  student's behalf, and what guardian information (if any) is
  captured at signup for students who are minors

These should be flagged, not silently resolved, if they become
relevant during implementation.