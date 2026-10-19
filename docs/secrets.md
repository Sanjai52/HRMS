# Credentials & per-page walkthrough input values (handoff)

Companion to `docs/context.md` (what the product is and how to verify it) and
`docs/ui-walkthrough.md` (the full UI acceptance walkthrough, Phases A–L). This file lets the
next person sign in as each actor and reproduce any page with the same inputs.

> State note: the dev database accumulates data across runs on purpose — e2e leftovers are
> visible everywhere. The walkthrough did not reset or reseed anything, and one actor was
> deliberately left deactivated (B. `ui.temp` — see Phase J / F17).

## Sites

| Site | URL | Notes |
|---|---|---|
| Web app | `http://localhost:3000` | all authenticated workflows |
| Public careers surfaces | on the web app: `/jobs`, `/jobs/<slug>`, `/jobs/<slug>/apply`, `/application-status` | the short link on the API origin (`:4000/s/<code>`) redirects here |
| API | `http://localhost:4000` | replicas `:4002`, `:4003`; front door NGINX `:8080` |
| Candidate portal | `http://localhost:4100` | simulated external profiles the sourcing crawler reads (read-only) |
| Mailpit | `http://localhost:8025` | captures *reset* and *announcement* e-mails; invitation mails never arrive (F6) |

## Accounts

| Person | Email | Password | Roles | State at handoff |
|---|---|---|---|---|
| (seeded HR) | `hr@hrms.local` | `ChangeMe123!` | HR (+ Settings) | ACTIVE |
| Meera Nair | `ui.manager@hrms.local` | `Walkthrough123!` | MANAGER | ACTIVE (password "reset" to the same value in J3) |
| Audit Admin | `ui.admin@hrms.local` | `Walkthrough123!` | ADMIN | ACTIVE |
| Temp User | `ui.temp@hrms.local` | `Walkthrough123!` | EMPLOYEE | **DEACTIVATED** (Phase J5) — login blocked; no reactivation path (**F17**) |
| Ravi Kumar | `ui.candidate@hrms.local` | — (never set) | applied → hired → INVITED | cannot log in — invitation accept never completed (**F6**) |

Practical notes: `/admin/*` needs ADMIN (HR sees "Restricted area — Admin access required.");
bearer sessions last 10 minutes with no web refresh (**F7**) — log in again if data goes empty;
repeated failed logins hit the rate limiter (test-only reset: `POST /system/test/reset-limiter`
on the API origin).

## Key ids created during the walk

| Thing | Value |
|---|---|
| Job | "UI Walkthrough Engineer" · slug `ui-walkthrough-engineer-677376` · short link `http://localhost:4000/s/Imw6iYw` |
| Application (Ravi) | `/hr/recruitment/applications/105600325418749952` · candidate profile `cand-105600325418749952` |
| Sourcing run | `105601577447854080` |
| Payroll batch (2026-10) | `105609744584019968` |
| Performance cycle | `105612053359628288` ("UI Walkthrough H2 2026") |
| Review (Meera wrote → Temp received) | `105612444155514880` |
| Employee records | Meera `532b682f-4112-409a-9c3a-278bf187aa2e` · Temp `2f7d3e36-5feb-4bd2-8677-fc329f4ab6de` · Audit Admin `22ad08af-d2eb-4618-819e-bf2ef41d09ce` |
| Leave requests (Temp) | `105608170436562944` · `105608529729032192` |

## Per-page input values

### A–C — Public shell & recruitment

- `/jobs` search box: type `Designer` (matches the accumulated live openings) or `UI Walk`.
- New opening (`/hr/recruitment/jobs/new`): Title **UI Walkthrough Engineer** · Department
  **Engineering** · Location **Chennai** · Description free text → "Publish opening".
- Apply form (`/jobs/ui-walkthrough-engineer-677376/apply`):
  - happy path: Full name **Ravi Kumar** · Email **ui.candidate@hrms.local** · Phone
    **+91 98765 43210** · Years of experience **3** · Skills **TypeScript, Node.js, Playwright** ·
    Resume: PDF (`.playwright-mcp/fixtures/ui-ravi-kumar.pdf`, untracked local fixture). The
    confirmation screen shows a one-time status token, e.g.
    `a66ec06dd1de5f2e3d503334f15d4e2552ae2151d85e5244a830f14d586242c5`, used on
    `/application-status`.
  - wrong-type negative: Full name **Wrongtype Tester** · Email **ui.wrongtype@example.com** ·
    Phone **9000000003** · Years **5** · Skills **Testing, QA** · Resume
    `ui-wrong-type.txt` → rejected with "Resume must be a PDF or Word document under 5 MB";
    nothing is created.
- Application detail: interview **Technical 1** · interviewer **Meera Nair**; assessment
  **Take-home · 8/10**; pipeline walked APPLIED → SCREENING → SHORTLISTED → ASSESSMENT →
  INTERVIEW → SELECTED.
- Sourcing run inputs (`/hr/recruitment/sourcing`): target **backend** · skills
  **node.js, postgres**.

### D — Onboarding

- Invite (`/hr/employees/new`): **Meera Nair** / `ui.manager@hrms.local` / Employee ·
  **Temp User** / `ui.temp@hrms.local` / Employee · **Audit Admin** / `ui.admin@hrms.local` /
  Admin. Accept at `/register?token=…` with New + Confirm password **Walkthrough123!**.
- Employee records (`/hr/employees/<id>` → Edit record / Salary structure):
  - Meera — Full name **Meera Nair** · Department **Engineering** · Designation **Engineering
    Manager** · salary **80000 / 20000 / 2000 / 12% / 10%**.
  - Temp — Full name **Temp User** · Department **Engineering** · Designation **Software
    Engineer** · salary **60000 / 10000 / 1000 / 12% / 10%**.
- "Create record" is offered only on RESERVED invitations.

### E — Attendance

- Employee self-service (`/attendance` as Meera, 2026-10-19): Check in → Check out (both stamps
  around **03:32 pm** IST, so the month row computes **LATE**).
- HR correction (`/hr/attendance`, date **2026-10-19**): Meera row → Correct → check-in
  **09:15**, status **PRESENT**, Reason: free text (required).
- Reports (`/hr/attendance/reports`): From/To + Department filters; all departments read
  355 present · 125 late · 34 absent · 17 half day.

### F — Leave

- Meera: Sick **26–27 Oct** (HR finalize), Casual **2–3 Nov** (rejected → HR **Override** with a
  written reason → APPROVED), Casual **9 Nov** (cancelled). Balances after the walk: sick
  **10/12**, casual **10/12**.
- Temp: Casual **16–17 Nov** and **5–6 Nov** (manager approve → HR finalize). Balance after:
  casual **8/12**.
- Policy chips on `/hr/leave`: casual 12 · earned 24 · sick 12.

### G — Payroll

- Run (`/hr/payroll/run`): Pay period **2026-10** (`2026-13` is blocked by the field's HTML
  pattern) → batch `105609744584019968` (150 done · 0 failed · 964 skipped of 1114; "skipped" =
  no salary structure).
- Payslips: figures in `docs/ui-walkthrough.md` G3/G4 — e.g. Temp **net −₹15,199.93** (0/21
  paid days), Meera **net −₹12,076.10** (2/21). Same numbers on `/payroll`, the record's
  **Payroll** tab and the employee dashboard card.

### H — Performance

- Cycle (`/hr/performance/cycles`): Name **UI Walkthrough H2 2026** · Starts **2026-10-01** ·
  Ends **2026-12-31**.
- Manager review (`/manager/performance` → Temp): goal "**Complete payroll validation**"
  (measure "Zero failed batches"); review Rating **4**, feedback "**Strong ramp-up; owned
  attendance, leave and payroll flows end to end.**"
- Release is API-only (**F14**): `POST /api/v1/performance/reviews/105612444155514880/release`
  (HR/ADMIN bearer token + `x-csrf-token` header from the login response).

### I — Notifications / announcement / profile / settings

- Announcement (`/notifications` as HR): title **October payslips are live**, body **Your
  2026-10 payslip is ready under Payroll. Reach out to HR with any questions.**
- Profile rename test (`/profile` as Temp): **Temp User QA** → saved → reverted to **Temp
  User**.
- Notification prefs (`/settings`): In-app ✓ · Email ✓.

### J — Password reset & deactivation

- Reset (`/forgot-password`): email **ui.manager@hrms.local** → Mailpit mail "Reset your HRMS
  password" → `/reset-password?token=…` (token prefilled) → New + Confirm **Walkthrough123!** →
  "Password updated". (Bad tokens are rejected cleanly.)
- Deactivation (`/hr/employees/2f7d3e36-…` → Access → "Deactivate employee" → confirm): Temp
  becomes INACTIVE; login blocked; removed from autocomplete, directory search and report
  counts; the admin users row reads DEACTIVATED. **No reactivation path (F17)** — restoring it
  would need direct DB/ops intervention; left deactivated on purpose.

## Out-of-band steps (documented workarounds)

1. **Manager assignment (F10)** — no UI control exists; Temp's `manager_id` was set to Meera
   (`532b682f-…`) via `PATCH /api/v1/employees/2f7d3e36-…` on the API so the manager approval
   leg could run.
2. **Invitation tokens (F6)** — the one-time tokens are returned by the API but rendered
   nowhere and never e-mailed; they were read from the UI's own network responses solely to
   open `/register?token=…` for the three invitees. Re-running needs the same capture (or a
   direct DB read).
3. **Review release (F14)** — no UI control; performed via
   `POST /api/v1/performance/reviews/:id/release` with an HR/ADMIN bearer token + CSRF header.
4. **Login rate limiter** — reset once via `POST /system/test/reset-limiter` (test-only route)
   during the walk.
