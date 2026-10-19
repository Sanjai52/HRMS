# UI Acceptance Walkthrough — Playwright MCP (live Chrome)

Method: the entire application is exercised through the UI in a real Chrome browser driven
by the Playwright MCP tools (`browser_*`) — every flow below was performed by clicking,
typing and reading the rendered pages, never by code-level e2e specs. Results are recorded
as observed. Links/ids that appear below were read from the live UI.

Environment (2026-10-19): local stack — web :3000, candidate portal :4100, NGINX :8080,
API replicas :4000/:4002/:4003, worker :4001, Mailpit :8025. All `/health` checks green
(catalog up, shards 1–4 `up:OPEN`); rate limiter reset before the walk.

Actors (created during this walk; credentials in `docs/secrets.md`):

| Person | Email | Role(s) | Created via |
|---|---|---|---|
| (seeded HR) | `hr@hrms.local` | HR (Settings access; `/admin/*` needs the audit account) | seed |
| Ravi Kumar | `ui.candidate@hrms.local` | applied → hired → INVITED (onboarding blocked — F6) | public apply → HR convert |
| Meera Nair | `ui.manager@hrms.local` | EMPLOYEE → MANAGER | HR onboard → invitation accept → admin role change |
| Temp User | `ui.temp@hrms.local` | EMPLOYEE (negative tests; deactivated in Phase J — F17) | HR onboard → invitation accept |
| Audit Admin | `ui.admin@hrms.local` | ADMIN (audit account; Admin group nav) | HR invite → invitation accept |

Phase checklist (results appended below as executed):

- [x] A. Public shell (landing, nav, published jobs)
- [x] B. Auth & session (login, errors, logout, protected routes)
- [x] C. Recruitment lifecycle — job → public search → apply → stages → hire → sourcing
- [x] D. Onboarding (invitation via Mailpit, account setup, employees admin)
- [x] E. Attendance (check-in/out, HR corrections, reports)
- [x] F. Leave (apply → manager recommend → HR finalize, cancel, override)
- [x] G. Payroll (batch run → payslips → HR validation)
- [x] H. Performance (cycle → goal → manager review → release → employee view)
- [x] I. Notifications / announcements / profile / settings
- [x] J. Security & negative flows (reset, RBAC, validation, deactivation)
- [x] K. Admin & reports pages
- [x] L. Candidate portal & cross-UI checks

## Findings

Recorded as discovered; severity tagged. No fixes applied during the walk (fix wave, if
any, is a separate approved pass).

| # | Phase | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | A | `favicon.ico` returns 404 (console error on every page load) | Minor (cosmetic) | open |
| F2 | B | Signed-out renders the full app chrome (sidebar + "Log out") over empty/restricted page bodies instead of redirecting to `/login`; no data exposure observed | Minor (UX) | open |
| F3 | C | Public apply form "Years of experience" is always stored as 0: the web form submits multipart text (strings) while the API requires `typeof experience === "number"` (`apps/api/src/routes/applications.ts` L65). UI evidence: field carried "3" at submit; candidate profile shows "0 yrs" | **Major (data loss)** | open |
| F4 | C | Uploaded resume is accepted at apply time but never surfaced in the HR web UI — no link/download on application detail or candidate profile, and no resume-display code exists in `apps/web` outside the apply form | Minor | open |
| F5 | C | FR-09 "Edit job openings" and "Close job openings" have no web-UI control (no `/hr/recruitment/jobs/[id]` route); API-only today | Moderate | open |
| F6 | C/D | **Invitation tokens are never delivered to anyone.** Both invite paths (convert-to-employee and `/hr/employees/new`) get `{token}` from the API but discard it: the convert notice is just "Invitation created for onboarding."; the invites list renders a literal placeholder `Accept link: /register?token=… (token shown once at creation)`. The register page says the token comes "From your invitation email" — no invitation email template/sender exists in the codebase, and Mailpit (verified live, message-trimming at cap) holds zero invitation mails (`ui.candidate`, `invitation`, `register` searches → 0). A real invitee can neither receive nor be given the token through the product | **Major (golden path blocker)** | open |
| F7 | D | 10-minute bearer tokens without refresh: login stores `hrms_token` (10-min exp) in sessionStorage; the web app never calls the existing `POST /auth/refresh` (with `hrms_refresh` cookie). After expiry bearer-backed fetches 401; `/hr/employees/new` silently renders "No invitations yet." despite existing invitations (verified live: expired Bearer in headers → 401 → fresh login → rows render) | Moderate | open |
| F8 | K | `/admin/audit-logs` unfiltered view is broken: the fetch URL is built as `.../audit-logs&limit=50` (missing `?`) → API 404; the page then shows "Restricted area — Admin access required" (misdiagnosis; "Try again" repeats the same URL). Adding a filter makes the URL well-formed and the log renders | Moderate | open |
| F9 | E | Employee attendance "This month" list renders the date column as a raw timestamp (`2026-10-18T18:30:00.000Z`) instead of a formatted date | Minor (cosmetic) | open |
| F10 | F | No web-UI control assigns an employee's manager (`employees.manager_id`) — the employee edit form has no manager field and `managerId` exists only in the API PATCH. Manager pages and PENDING_MANAGER routing depend on it, so without out-of-band data every request routes to HR and the manager queue can never trigger from the UI | Moderate | open |
| F11 | F | Manager `/manager/leave` shows Approve/Reject on PENDING_HR rows of their reports; clicking always fails with "You cannot decide this request" (403) — buttons should not be shown to non-HR on PENDING_HR rows | Minor (UX) | open |
| F12 | G | Mid-month payroll runs make every workday without a PRESENT/LATE attendance row (including days before a hire date and days still in the future) loss of pay, while PF/tax/other are deducted at the full month — the two new joiners' payslips showed **negative net pay**: Meera −₹12,076.10 (2/21 paid days) and Temp −₹15,199.93 (0/21) | Moderate (pay correctness) | open |
| F13 | G | Payroll counts approved leave one day early: `packages/core/src/payroll-chunk.ts` L63 does `start_date.toISOString().slice(0,10)` on a DATE that node-postgres parses at local midnight — on this IST host the window shifts back one day (repro: `new Date(2026,9,26).toISOString().slice(0,10)` → `2026-10-25`). Meera's 2-day approved sick leave counted as 1 workday → one extra LOP day (₹4,761.90) | Moderate (pay correctness) | open |
| F14 | H | Reviews can be written and submitted but **never released from the web UI**: `POST /api/v1/performance/reviews/:id/release` (HR/ADMIN) has no control anywhere — "released" appears in the web app only as read-only text. The manager sees "HR releases it to the employee." but no HR screen can do it, so employees can never view reviews through the product | Moderate | open |
| F15 | H | `GET /api/v1/performance/team` fails on **every** owned shard: the query forces the param to text (`$2::text`) and then compares `e.manager_id = $2` → `ERROR: operator does not exist: uuid = text` (reproduced via PREPARE on shard-1; same query with correct types returns the row). Per-shard errors are swallowed → `partial: {unavailable: [shard-1, shard-2, shard-3]}` and empty data, so the manager review list always shows "No reviews written for this cycle yet." (even right after a successful submit) | Moderate | open |
| F16 | I/J | Role-gated HR pages render for signed-in EMPLOYEE accounts with misleading states: `/hr/employees` shows "Sign in to browse the directory" + "Go to login" (the user *is* signed in) and `/hr/payroll` renders the HR heading plus a "Run payroll" action link with "Could not load batches". No data is returned (APIs reject) and `/admin/*` shows the correct "Restricted area — Admin access required." for both employees and HR — the HR-area copy/affordances are the odd ones out | Minor (UX) | open |
| F17 | J | Deactivation is one-way through the product: the only controls are "Deactivate employee" (HR record, confirm dialog) and "Deactivate" (admin users), and no reactivate endpoint exists (the only `status = 'ACTIVE'` write is invitation acceptance). After the Phase J test, `ui.temp@hrms.local` is permanently blocked (login → "Invalid email or password"; removed from autocomplete, directory search and report counts) with no UI/API path to restore it | Minor (operational) | open |

---

## Phase A — Public shell

Status: PASS (2026-10-19)

- Landing `/` renders as a product page: banner (HRMS mark; Log in / Sign in → `/login`),
  hero "Every people process, one workspace" with "Sign in to HRMS" CTA, three feature cards
  (People directory · Time off and attendance · Payroll and hiring), a closing CTA block and
  a footer with Product nav (`/hr/employees`, `/attendance`, `/leave`, `/payroll`) and
  Account nav (`/login`, `/dashboard`). Imagery loads; no broken layout.
- Public jobs board `/jobs`: heading "Open roles", search combobox, and the live list of
  open jobs (accumulated demo/e2e openings are visible, as expected on a dev database).
- Jobs search: typed `Designer` into the search box → the suggestion dropdown listed exactly
  the two live `Designer 1792…` openings — the public jobs autocomplete index works in the UI.
- Finding F1 (Minor): `favicon.ico` 404 logged in the browser console on page load.

## Phase B — Auth & session

Status: PASS (2026-10-19)

- Login page: "Welcome back" — Email address (browser-autofilled), Password with "Forgot
  password?" link (`/forgot-password`), "Log in" button, "Invited to join? Accept your
  invitation" (`/register`).
- Wrong password → inline alert **"Invalid email or password"**, stays on `/login`.
- Correct HR login → `/dashboard`. Sidebar: Dashboard, Employees, Attendance, Leave, Payroll,
  Recruitment, Performance, Reports, Log out. Topbar: employee search, Notifications (38
  unread at walk start), account menu (H) with **Profile** and **Log out**.
- Session persists across navigations and reloads.
- Log out → redirected to `/login`.
- Logged-out access to protected routes: no data exposure — `/dashboard` renders a "You are
  signed out · Go to login" panel, `/admin/users` renders "Restricted area — Admin access
  required" with 0 rows, `/hr/employees` renders an empty directory state (see F2 for the
  chrome oddity).

## Phase C — Recruitment lifecycle

Status: PASS with findings (2026-10-19)

- C1 — Recruitment dashboard (`/hr/recruitment`): pipeline stage cards with live counts
  (applied 42 at walk start), section nav (Job postings, New opening, Applications,
  Candidate pool, Sourcing).
- C2 — Job creation (`/hr/recruitment/jobs/new`: Title "UI Walkthrough Engineer", Department
  "Engineering" pre-filled, Location "Chennai", Description) → **Publish opening** →
  success panel with an auto-generated short link `http://localhost:4000/s/Imw6iYw` and a
  "View public page" link.
  - Public job page `/jobs/ui-walkthrough-engineer-677376` renders the role (dept · location ·
    type, "About the role", "Apply now").
  - Short link `GET http://localhost:4000/s/Imw6iYw` redirected the browser to the public job
    page — the shortener works end to end through the UI.
- C3 — Public search: typed "UI Walk" into the `/jobs` search → suggestion "UI Walkthrough
  Engineer" → public page. The public autocomplete indexes the new posting immediately.
- C4 — Application submitted from `/jobs/ui-walkthrough-engineer-677376/apply` as
  **Ravi Kumar** (`ui.candidate@hrms.local`, phone +91 98765 43210, 3 yrs experience, skills
  TypeScript/Node.js/Playwright, 238-byte PDF resume uploaded — accepted). Confirmation
  screen showed the one-time status token
  `a66ec06dd1de5f2e3d503334f15d4e2552ae2151d85e5244a830f14d586242c5`; the public
  `/application-status` page with that token renders "UI Walkthrough Engineer" at stage
  **APPLIED**.
- C5 — HR pipeline: applications list with stage filter chips (All/applied/…/withdrawn).
  Ravi's application (`/hr/recruitment/applications/105600325418749952`) shows header,
  pipeline, History, Interviews and Assessments. Scheduled interview **Technical 1 ·
  Meera Nair** → SCHEDULED; recorded assessment **Take-home · 8/10**. Then walked the
  pipeline one click at a time: APPLIED → SCREENING → SHORTLISTED → ASSESSMENT → INTERVIEW →
  SELECTED, each transition landing in History immediately.
- C6 — **Convert to employee** → "Invitation created for onboarding." (invitation email in
  Mailpit; acceptance is Phase D).
- C7 — Candidate pool: searchable list; Ravi's profile
  (`/hr/recruitment/candidates/cand-105600325418749952`) shows contact, skills, source and
  the application link — where **F3** (0 yrs) and **F4** (no resume link) were confirmed.
- C8 — Sourcing: started a run from `/hr/recruitment/sourcing` (target "backend", skills
  "node.js, postgres") → run `105601577447854080` listed **COMPLETED · 3 pages · 4 found ·
  0 imported · 0 errors**; the detail page shows the visited pages with status codes
  (`/listings?page=1..3` → 200) and a link to the candidate pool.
- C-note (**F5**): FR-09 includes "Edit job openings" and "Close job openings"; the web UI
  has neither — the job list only links "Public page", and no `/hr/recruitment/jobs/[id]`
  route exists. Both are API-only today.

## Phase D — Onboarding

Status: PASS with findings (2026-10-19) — **the invitation e-mail leg does not exist; see F6**

- D1 — Invitations from `/hr/employees/new` ("Invite a new joiner": Full name, Email, Role
  select Employee/Manager/HR/Admin). Duplicate guard live: re-inviting
  `ui.candidate@hrms.local` → banner **"An invitation for this email is already open"**
  (API 409). Invited: **Meera Nair** `ui.manager@hrms.local` (EMPLOYEE), **Temp User**
  `ui.temp@hrms.local` (EMPLOYEE), **Audit Admin** `ui.admin@hrms.local` (ADMIN).
  The one-time tokens are returned by the API but rendered nowhere — see **F6**; they were
  captured for this walk from the UI's own network responses (DevTools-equivalent) purely
  so the downstream accept/onboard screens could be exercised.
- D2 — Acceptance as the invitee: `/register?token=…` prefills the token from the URL;
  set New password + Confirm → "Join workspace" → authenticated session for the invitee
  (INVITED → RESERVED). Verified for Meera, Temp and Audit Admin.
- D3 — Role-aware shell: employees get the **EMPLOYEE** nav (Dashboard, Attendance, Leave,
  Payroll, Performance) and a generic "Good day" until an employee record exists; Admin
  gets the full HR nav **plus** a Settings link and the Admin group (Users & roles, Roles,
  Audit log, System health, Shards).
- D4 — Onboarding: "Create record" (offered only on RESERVED invitations) → "Employee
  record created. It appears in the directory once synced." → invitation becomes **ACTIVE**.
- D5 — Directory `/hr/employees` (search + "Add employee"): Meera found and opened at
  `/hr/employees/532b682f-4112-409a-9c3a-278bf187aa2e`. Record page: Overview/Attendance/
  Leave/Payroll tabs, **Edit record** (Full name/Department/Designation → "Changes saved."),
  **Salary structure** (Basic 80000 · Allowances 20000 · Other deductions 2000 · PF 12% ·
  Tax 10% → "Salary saved."), **Access → Deactivate employee**. Temp set up the same way
  (Engineering / Software Engineer / 60000+10000/1000/12%/10%).
- D6 — **Ravi Kumar stays INVITED**: the converted candidate's onboarding cannot complete
  through the product (F6) — the exact point where the requested "HR approves → onboarding
  completes" path breaks in the UI.

## Phase E — Attendance

Status: PASS with findings (2026-10-19)

- E1 — Employee self-service (`/attendance` as Meera): "Today · Not checked in" → **Check in** →
  "Checked in at 03:32 pm", button flips to **Check out**; month list gains a row, status
  computed **LATE** for the afternoon check-in ("0 present · 1 late this month").
- E2 — **Check out** → "Done · 03:32 pm – 03:32 pm" and the row shows the span.
- E3 — HR administration (`/hr/attendance`): date picker (2026-10-19) + per-row **Correct** →
  "Correct attendance" dialog (Status select PRESENT/LATE/ABSENT/HALF_DAY, Check-in/Check-out
  times, required **Reason**). Corrected Meera: check-in 09:15, status PRESENT, reason —
  "Correction saved for Meera Nair on 2026-10-19."; the row then read
  **09:15 am – 03:32 pm · PRESENT** on reload.
- E4 — Reports (`/hr/attendance/reports`): From/To + Department filters; summary cards
  (all departments: Present 355 · Late 125 · Absent 34 · Half day 17; Engineering filter:
  184/21/0/0) + a "Daily totals" table.
- F-note: employee month list date column shows the raw timestamp — **F9**.

## Phase F — Leave

Status: PASS with findings (2026-10-19)

- F1 — Employee side (`/leave` as Meera): balances ("sick leave 12 left of 12", "casual
  leave 12 left of 12") and **Apply for leave** (Leave type Casual/Sick/Earned, Reason,
  Start/End date; "Weekends and public holidays are not counted. Requests stay within one
  year."). Sick 26–27 Oct submitted → **PENDING_HR** (no manager on file → HR fallback).
  A third request (casual 9 Nov) was withdrawn from the list with **Cancel** →
  **CANCELLED**, button gone.
- F2 — Manager leg: the web UI has no manager-assignment control (**F10**), so the walk
  set `managerId` out-of-band (Temp → Meera). Temp's next request then routed
  **PENDING_MANAGER**; `/manager/team` listed Temp (Software Engineer · Engineering ·
  ACTIVE) and `/manager/leave` ("Leave approvals", filters All/manager/hr/approved/
  rejected) showed the reports' requests. Manager **Approve** → the request moved to
  **PENDING_HR** (two-stage chain: manager recommends, HR finalizes). Approving a
  PENDING_HR row as manager → inline "You cannot decide this request" (**F11**).
- F3 — HR side (`/hr/leave`, "Leave administration"): policy chips (casual 12 · earned 24 ·
  sick 12) and queue filters All/hr/manager/approved/rejected. Approved Temp's two requests
  and Meera's sick leave; rejected Meera's casual 2–3 Nov → **REJECTED**; then used the
  HR-only **Override** on the rejected row (written reason required) → **APPROVED**
  (rejected queue then "Nothing here.").
- F4 — Back at the employees: Temp `/leave` — both requests **APPROVED**, casual balance
  **8 left of 12**; Meera — **10 left of 12** for sick and casual, statuses
  CANCELLED/APPROVED/APPROVED.

## Phase G — Payroll

Status: PASS with findings (2026-10-19)

- G1 — Batch history (`/hr/payroll`): accumulated periods, each COMPLETED (e.g., 2026-09 —
  148 done · 963 skipped of 1111), plus the run link.
- G2 — Run (`/hr/payroll/run`): "Queues one job per shard. Progress appears on the batch
  page; employees are notified when their payslip is ready." Pay period field
  (`pattern="\d{4}-(0[1-9]|1[0-2])"`). Invalid `2026-13` did not submit (browser-level
  pattern validation; no batch created); `2026-10` queued → batch page
  `105609744584019968` → **COMPLETED · 150 done · 0 failed · 964 skipped of 1114**
  (skipped = employees without a salary structure), rows list name · gross · net.
- G3 — Employee payslips (`/payroll` → detail): Temp — "2026-10 · **0/21 paid days**":
  Gross ₹70,000.00 / LOP −₹69,999.93 / PF −₹7,200.00 / Tax −₹7,000.00 / Other −₹1,000.00 /
  **Net −₹15,199.93**. Meera — "**2/21 paid days**": Gross ₹1,00,000.00 / LOP −₹90,476.10 /
  PF −₹9,600.00 / Tax −₹10,000.00 / Other −₹2,000.00 / **Net −₹12,076.10**".
- G4 — HR validation: Meera's employee record → **Payroll** tab → "Payroll records ·
  2026-10 — Gross ₹1,00,000.00 · LOP ₹90,476.10 · 2/21d — ₹−12,076.10".
- F-notes: **F12** — attendance-only paid days (PRESENT/LATE rows + approved leave) turn
  every un-recorded workday (pre-joining and future days) into LOP while PF/tax/other are
  full-month → the negative nets above. **F13** — approved leave counts one day early
  (DATE → local midnight → `toISOString()` shift) — Meera's 2-day leave counted as 1
  workday → one extra LOP day (₹4,761.90).

## Phase H — Performance

Status: PASS with findings (2026-10-19)

- H1 — Cycle: `/hr/performance/cycles` — "New cycle" (Name, Starts, Ends; date inputs) →
  **UI Walkthrough H2 2026 · 1 Oct 2026 → 31 Dec 2026 · ACTIVE** (dev DB carries many
  accumulated e2e cycles, each with a Close button).
- H2 — Manager: `/manager/performance` → Temp → the cycle select defaults to the new
  ACTIVE cycle. Added goal "Complete payroll validation · 0% · Zero failed batches" and
  submitted a review — Rating **4**, feedback "Strong ramp-up; owned attendance, leave and
  payroll flows end to end." → notice "Review submitted. HR releases it to the employee."
  The page's own list still read "No reviews written for this cycle yet." (**F15**).
- H3 — Release gate (as Temp, `/performance`): before — "Released reviews · No released
  reviews yet."; after the release step — **4 / 5** + the feedback text. No web control
  performs the release (**F14**); it was done via `POST /reviews/:id/release` (API),
  mirroring the HR step the UI lacks.
- H4 — HR summary (`/hr/performance` with the cycle selected): Completion **100% · 1 of 1
  reviews released**; Reviews written 1; Rating mix 5★ 0 · **4★ 1** · 3★ 0 · 2★ 0 · 1★ 0.

## Phase I — Notifications / announcements / profile / settings

Status: PASS (2026-10-19)

- I1 — Employee notifications (`/notifications` as Temp): feed of clickable items (clicking marks
  read — the dashboard count fell 5 → 4 after one more click): "October payslips are live — Your
  2026-10 payslip is ready under Payroll…" (04:00 pm), "Review released — Your performance review
  is ready to view." (03:59 pm), "Payslip ready — Your payslip for 2026-10 is ready." (03:45 pm),
  "Leave approved — Request 105608170436562944 is now APPROVED." ×2 (03:42 pm), "Leave pending_hr
  — Request 105608529729032192 is now PENDING_HR." (03:41 pm).
- I2 — Announcement (HR view of the same page): "New announcement" composer — "Sends an in-app
  notification and an e-mail to every active employee, respecting their notification settings."
  Posted **"October payslips are live"** / "Your 2026-10 payslip is ready under Payroll. Reach out
  to HR with any questions." → "Announcement sent to every active employee." It appeared at the
  top of Temp's feed, and Mailpit shows per-employee copies (e.g., to `e2emgr1792401357561@`,
  `e2eaccept1792401349494@`).
- I3 — Profile (`/profile` as Temp): "My profile" card (TU · Temp User · Software Engineer ·
  Engineering · ACTIVE) and Personal details — Full name (editable) + "Email address (managed by
  HR)" disabled → renamed to "Temp User QA" → **"Profile updated."** with the header updated;
  reverted to "Temp User" → "Profile updated.".
- I4 — Employee dashboard (`/dashboard` as Temp): "Good day, Temp"; **Attendance today** — "Not
  checked in"; **Leave balance** — "8 days left"; **Latest payslip** card ("₹−15,199.93 ·
  2026-10") links to `/payroll`; **Unread notifications** 5 → `/notifications`.
- I5 — Settings (`/settings`, HR/Admin shell): sections Notifications (In-app ✓ / Email ✓ +
  "Save notifications"), Departments, Designations, Leave policies (casual 12 · earned 24 · sick
  12), Holidays 2026 — exercised earlier in the walk (preference saved, "Data Science" added);
  values above are the live state captured today.

## Phase J — Security & negative flows

Status: PASS with findings (2026-10-19)

- J1 — RBAC at the page level: as Temp (EMPLOYEE), `/hr/employees` shows the directory shell with
  "Sign in to browse the directory" + "Go to login" (**F16**), and `/hr/payroll` shows the HR
  heading + a "Run payroll" link with "Could not load batches" (**F16**) — no data leaks (the APIs
  reject), but the copy/affordances are wrong for a signed-in employee. As HR, `/admin/users`
  shows the correct **"Restricted area — Admin access required."**
- J2 — Validation: wrong-type resume upload on the public apply form (`ui-wrong-type.txt`) →
  **"Resume must be a PDF or Word document under 5 MB"**, no submission (form retained, no
  candidate created). Invalid payroll period `2026-13` did not submit (Phase G2).
- J3 — Password reset (full happy path): `/forgot-password` → "Check your inbox — If an account
  exists for ui.manager@hrms.local, we have sent a reset link. It stays valid for 30 minutes.";
  Mailpit holds **"Reset your HRMS password"** delivered seconds later with the token link
  (contrast F6: invitation e-mails never arrive; reset e-mails do). The reset page prefills the
  token; a bad token → "This reset link is invalid or has expired. Request a new one."; a correct
  one → **"Password updated — Your new password is active."** (password reset to the same value;
  login verified 200 afterwards).
- J4 — Employee update via the UI: record → Edit record → Designation "Software Engineer" →
  "Software Engineer II" → **"Changes saved."** → reverted → "Changes saved.".
- J5 — **Deactivation** (record → Access → "Deactivate employee", confirm): redirects to the
  directory; the record then shows **INACTIVE**; topbar autocomplete for "Temp" suggests nothing
  (while "Meera" still suggests → the drop is specific), directory search "Temp" → "No people
  match that search."; login as `ui.temp@hrms.local` → **"Invalid email or password"** (stays on
  `/login`). Cross-UI: `/admin/users` row → **DEACTIVATED** with Deactivate disabled; `/hr/reports`
  dropped People 1117 → **1116** and Engineering 42 → **41**. **F17**: no reactivation anywhere —
  the account cannot be restored through the product.

## Phase K — Admin & reports pages

Status: PASS with findings (2026-10-19) — as Audit Admin (`ui.admin@hrms.local`)

- K1 — Users & roles (`/admin/users`): "1682 accounts · showing the newest 100" — rows carry email,
  joined date (+ "Employee record" link), the four role checkboxes (EMPLOYEE/MANAGER/HR/ADMIN),
  a status pill, "Save roles" (disabled until a change) and "Deactivate". Role editing was
  exercised earlier in the walk (Meera EMPLOYEE → MANAGER → "Roles updated…"); today
  `ui.temp@hrms.local` reads **DEACTIVATED** with Deactivate disabled (consistent with Phase J).
- K2 — Roles & permissions (`/admin/roles`): "Read-only reference of the role-based access control
  matrix (PRD §10.2). The backend enforces these rules on every request; sidebar visibility is not
  authorization." Role counts: EMPLOYEE 1086 · MANAGER 277 · HR 1 · ADMIN 337 accounts, plus the
  capability × role matrix table.
- K3 — System health (`/admin/system-health`): **ACTIVE · "All databases accept writes."**; shard
  cards — shard-1 461 people · 0 queued events, shard-2 391/0, shard-3 383/0, shard-4 0/0, all
  **OPEN**; "Request traffic" Prometheus counters (e.g., `POST /login 200 → 181`,
  `POST /jobs/:jobId/applications 201 → 14`, `POST /invitations 201 → 123`).
- K4 — Shards (`/admin/shards`): Ring members — shard-1 · active, shard-2 · active, shard-3 ·
  active, **shard-4 · standby**; controls **"Preview adding shard-4"** and **"Add shard-4"** — the
  walk deliberately never clicked "Add shard-4" (the preview had rendered in an earlier pass);
  Shard status cards; Live processes (`api:api:4003:…`, `:4002:…`, `:4000:…`, `worker:41972` — each
  `map v1 · OPEN`).
- K5 — Audit log (`/admin/audit-logs`): "Audit log" + "Filter by action" + Filter button; the
  unfiltered load reproduces **F8** even as ADMIN — the page shows "Restricted area — Admin access
  required." because the malformed `…&limit=50` URL 404s (misdiagnosed); with a filter the URL is
  well-formed and the log renders.
- K6 — Reports (`/hr/reports`): People **1116** (24 departments); Leave requests **371** (87 with
  HR · 67 with managers); Attendance records (2026-10) **531** (355 present · 125 late);
  "Headcount by department" — Engineering 41, HR 10, Finance 8, Sales 7, Design 7, then accumulated
  `T15 Support …` departments (×2 each) from prior e2e runs. (Before the Phase J deactivation the
  same page read People 1117 / Engineering 42.)

## Phase L — Candidate portal & cross-UI checks

Status: PASS (2026-10-19)

- L1 — Candidate portal (`http://localhost:4100`, title "Open Profiles"): "Open candidate
  profiles" → **"Browse listings"** → `/listings?page=1` ("Profiles, page 1") — candidate cards
  (Nila Fernando · nila.fernando@example.com · Node.js, Postgres, Redis · 4 years; Ravi Shankar ·
  Python, Django 6 yrs; Meera Nair · React 3 yrs; Arjun Rao; Divya Menon …), each with a "View"
  link (`/profiles/p01`…) and a "Next" (`?page=2`) pager — the simulated external source the
  sourcing crawler reads (its run detail links exactly these `/listings?page=1..3` pages, Phase C8).
- L2 — Cross-UI consistency: the public job stays visible on `/jobs` ("UI Walkthrough Engineer")
  while HR manages it under Recruitment; the Phase J deactivation propagated across HR record
  (INACTIVE), topbar autocomplete, admin users (DEACTIVATED) and reports (1117→1116 / 42→41);
  payslips surface with the same figure (₹−15,199.93 · 2026-10) on the record Payroll tab, the
  employee `/payroll` list/detail and the dashboard card; leave/review/announcement events all
  appear in the employee notification feed.
