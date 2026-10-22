# UI Audit — Error and Identifier Leakage
**Date:** 19 Oct 2026 · **Scope:** `apps/web/app/**/page.tsx`, `apps/web/components/**/*.tsx`, `apps/web/lib/*.ts` (read-only audit; no code changed).
**Severity:** Critical = raw exception/secret on a public or all-employee surface. High = raw technical text or machine ID visible to employees/candidates, or a systemic source feeding every screen. Medium = admin-only technical detail or error UX that hides/misplaces the real outcome.
**Counts:** 44 remediation items — **2 Critical, 17 High, 25 Medium** (source and sink are counted separately). Backend strings quoted below were read from `apps/api/src` only to establish what the UI can receive; no API code was changed.
---

## 1. Technical leakage inventory

### L1. Raw backend error text is forwarded by the shared clients — **Critical**
`apps/web/lib/api.ts:18` and `apps/web/lib/hr.ts:25`

```ts
throw new Error(body?.error?.message ?? `request-failed:${res.status}`);
```
Every page below inherits this. Users can see `request-failed:500/502/503`, `No shard owns this record` (e.g. `apps/api/src/routes/employees.ts:60`), `A backend dependency is unavailable; retry shortly` (`apps/api/src/index.ts:108`), or `Invitation is RESERVED. The invitee must accept it first.` (`apps/api/src/routes/employees.ts:152`).
**Replacement:** throw a typed `ApiError`; map to the copy in §4. Never pass `body.error.message` through. Technical text goes to `console.error` only.

### L2. Native fetch rejections are unclassified — **Critical**
`apps/web/lib/api.ts:4`, `apps/web/lib/hr.ts:11` call `fetch` with no `try/catch`. A dropped connection produces a browser `TypeError: Failed to fetch`, which the pages in L3 render verbatim.
**Replacement:** catch rejection, classify as `network`, show **We couldn't connect** / "Check your internet connection and try again." / **Try again**. Do not inspect or render `error.name`/`error.message`.

### L3. `err.message` rendered on page or inline — 23 pages
Representative code in every row: `setError((err as Error).message)` at the "set" lines, `{error}` at the "render" lines.

| # | Page (set → render) | What the user can see | Sev | Replacement title / body / action |
|---|---|---|---|---|
| 1 | `app/attendance/page.tsx:31,47 → :62,90` | `Failed to fetch`, `request-failed:500`, "Your session expired." | High | **We couldn't load your attendance** / "Check your connection and try again." / **Try again**. Check-in: **We couldn't save your check-in** / "Nothing was recorded. Try again." / **Try again** |
| 2 | `app/leave/page.tsx:39,54 → :69,89` | same, or `No shard owns this record` | High | **We couldn't load your leave** / "Check your connection and try again." / **Try again**. Cancel: **We couldn't cancel this request** / "The request is unchanged. Try again." / **Try again** |
| 3 | `app/leave/apply/page.tsx:28 → :62` | raw validation/500 text | High | **We couldn't submit your request** / "Nothing was sent. Check the dates and try again." / **Try again** |
| 4 | `app/payroll/[id]/page.tsx:35 → :44` | raw 404/500 text | High | **We couldn't open this payslip** / "It may have been removed, or the link may be incorrect." / **Back to payroll** |
| 5 | `app/profile/page.tsx:85 → :101` | raw 409 "Your profile changed..." or 500 | High | **We couldn't save your profile** / "Your details were not changed. Try again." / **Try again** |
| 6 | `app/notifications/page.tsx:53 → :72` | raw error shown under the **Title** field | High | **We couldn't send the announcement** / "Nothing was sent. Try again." / **Try again** (move to a page-level `Alert`) |
| 7 | `app/settings/page.tsx:29 → :100`, `:50 → :89` | raw error; add-department/designation failures are silent | Medium | **We couldn't load settings** / "Check your connection and try again." / **Try again**. Save: **We couldn't save your notification settings** / "Your choices were not saved. Try again." / **Try again** |
| 8 | `app/admin/users/page.tsx:66,79 → :98` | raw 403/409/500 text | Medium | **We couldn't update this account** / "Nothing changed. Refresh and try again." / **Refresh** |
| 9 | `app/admin/system-health/page.tsx:27 → :46` | raw error under "Restricted area" | Medium | **We couldn't load system health** / "Check your connection and try again." / **Try again** |
| 10 | `app/admin/shards/page.tsx:25,61,73 → :87,:123` | raw migration/DB error text | Medium | **We couldn't load database status** / "Check your connection and try again." / **Try again**. Migration: **We couldn't start the migration** / "Nothing changed. Try again." / **Try again** |
| 11 | `app/hr/employees/[id]/page.tsx:96,113,135,148 → :158,:290,:220`; `:245 → :269` | raw 404/409/500 in page card, activity tab, save and salary forms; salary errors use neutral text | Medium | **We couldn't open this employee** / "The record may have been removed." / **Back to directory**. Save: **We couldn't save these changes** / "Nothing was changed. Refresh and try again." / **Refresh**. Salary: **We couldn't save the salary structure** / "Nothing was changed. Try again." / **Try again** |
| 12 | `app/hr/attendance/page.tsx:87 → :188` | raw correction error inside modal | Medium | **We couldn't save this correction** / "The attendance record is unchanged. Try again." / **Try again** |
| 13 | `app/hr/employees/new/page.tsx:55,73 → :110` | raw 409/500 text | Medium | **We couldn't send this invitation** / "No invitation was created. Check the email and try again." / **Try again**. Onboard: **We couldn't create this employee record** / "Nothing was created. Try again." / **Try again** |
| 14 | `app/hr/performance/cycles/page.tsx:50 → :69` | raw validation/500 text | Medium | **We couldn't open this review cycle** / "No cycle was created. Check the dates and try again." / **Try again** |
| 15 | `app/hr/payroll/run/page.tsx:25 → :46` | raw validation/502 text | Medium | **We couldn't start payroll** / "No payroll run was created. Check the pay period and try again." / **Try again** |
| 16 | `app/manager/team/[id]/page.tsx:61 → :74` | raw 404/500 text | Medium | **We couldn't open this team member** / "The record may have been removed." / **Back to my team** |
| 17 | `app/manager/performance/[employeeId]/page.tsx:56,101,144 → :165` | raw error, placed inside the review form (below the fold on load failure) | Medium | **We couldn't load this review** / "Check your connection and try again." / **Try again**. Goal: **We couldn't add this goal** / "Nothing was saved. Try again." / **Try again**. Submit: **We couldn't submit this review** / "The review is still a draft. Try again." / **Try again** |
| 18 | `app/hr/recruitment/sourcing/page.tsx:55 → :82` | raw queue/500 text | Medium | **We couldn't start sourcing** / "No run was started. Try again." / **Try again** |
| 19 | `app/hr/recruitment/candidates/[id]/page.tsx:21 → :30` | raw 404/500 text | Medium | **We couldn't open this candidate** / "The profile may have been removed." / **Back to candidate pool** |
| 20 | `app/hr/recruitment/applications/[id]/page.tsx:32,53,65 → :79,:115` | raw 404/409/500 text | Medium | **We couldn't open this application** / "It may have been removed." / **Back to applications**. Stage: **We couldn't move this application** / "The stage is unchanged. Refresh and try again." / **Refresh**. Convert: **We couldn't create the invitation** / "Nothing was created. Try again." / **Try again** |
| 21 | `app/hr/recruitment/jobs/new/page.tsx:45 → :72` | raw validation/500 text | Medium | **We couldn't publish this opening** / "Nothing was published. Try again." / **Try again** |
| 22 | `app/jobs/[slug]/apply/page.tsx:57 → :106` | raw 400/409/500 text to a candidate | High | **We couldn't submit your application** / "Nothing was sent. Check your details and try again." / **Try again** |
| 23 | `components/leave-decision.tsx:24 → :66` | raw decision/409 text | High | **We couldn't record this decision** / "The request is unchanged. Refresh and try again." / **Refresh** |

### L4. Auth/public forms read `body?.error?.message` directly — **High**
`app/login/page.tsx:30`, `app/register/page.tsx:37`, `app/reset-password/page.tsx:36`, `app/jobs/[slug]/apply/page.tsx:57`

```ts
setError(body?.error?.message ?? "Login failed. Check your details and try again.");
```
The fallback is good, but any backend message wins. 401 on login must become **Email or password is incorrect.** (no account enumeration); register 409 → **That email is already registered. Try signing in instead.**; reset/accept 410 → **This link has expired** / "Ask your sender for a new link." / **Request a new link**. Never echo the response message.

### L5. Prometheus text rendered in a `<pre>` — **High**
`app/admin/system-health/page.tsx:70` (source filter at `:32`)

```tsx
<pre ...>{metrics || "Loading…"}</pre>
```
Users see lines beginning `hrms_http_requests_total{method="GET",route="/api/v1/...",status="200"} …`. Also `:33` sets only matching lines; a metrics fetch failure leaves "Loading…" forever.
**Replacement:** **Request traffic** / "Requests are being served normally." / no action plus optional **Open monitoring** (configured production URL). Show 2–4 human cards (requests, error rate, slowest endpoint), not metric names or labels.

### L6. `localhost` tool links in the product UI — **High**
`app/admin/system-health/page.tsx:72,75,78` → `http://localhost:9090` (Prometheus), `:3001` (Grafana), `:8025` (Mailpit). These are dead links on every real deployment and expose the dev stack.
**Replacement:** remove from the product. If needed, one **Open monitoring** button using a configured `NEXT_PUBLIC_MONITORING_URL`; hide it when unset.

### L7. Raw migration state/error appended to the UI — **High**
`app/admin/shards/page.tsx:40,120`

```tsx
setRunState(`${r.state} · ${r.current_step}${r.error ? ` · ${r.error}` : ""}`);
...
<p ...>Run: {runState}</p>
```
Users see `RUNNING · copy_employees · connection terminated`, `FAILED · smoke_check · relation "employee_v3" does not exist`.
**Replacement:** **Migration in progress** / "Step 2 of 5: copying employee records." or **Migration paused** / "Some records may not have moved. Contact your platform administrator." / **View progress**. Never render `r.error`.

### L8. Shard names leak into HR-facing partial banners — **High**
`app/hr/attendance/page.tsx:114`, `app/hr/attendance/reports/page.tsx:109`, `app/hr/reports/page.tsx:46`

```tsx
Partial results — unavailable: {partial.join(", ")}. Healthy records are complete.
```
The API fills `meta.unavailable` with shard keys (`apps/api/src/routes/reports.ts:18-31`, `attendance.ts` equivalent), so HR sees `unavailable: shard-1, shard-3`.
**Replacement:** **Some records are temporarily unavailable** / "Counts may be incomplete. Try again in a few minutes." / **Try again**. Keep the healthy data visible.

### L9. HTTP status codes and crawl error strings shown as badges — **Medium**
`app/hr/recruitment/sourcing/[id]/page.tsx:57-61`

```tsx
{p.status || "error"} · {p.error}     // and a literal "200" pill
```
Users see `200`, `404 · fetch failed`, `500 · net::ERR_NAME_NOT_RESOLVED`.
**Replacement:** **Visited** for success; **Couldn't load this page** / "The source page did not respond." / no action (optional **Open page**). Remove numeric codes from the DOM.

### L10. Shard/bucket jargon in admin copy — **Medium**
`app/admin/shards/page.tsx:102,108-110,117,145`

```tsx
<span>shard-4 · standby</span>
<p>Version {preview.toVersion}: {preview.moves} buckets move, about {preview.estimatedRows} records to copy.</p>
<p>map v{p.map_version_loaded} · {p.gate_state}</p>
```
**Replacement:** **Shard 4 · standby**, **This adds a fourth database and moves about 12,400 records. Writes pause during the move.** / **Preview** / **Add database**. Replace `map v37 · ACKED` with **Configuration up to date** / **Waiting for acknowledgement**.

### L11. Machine action code used as filter placeholder — **Medium**
`app/admin/audit-logs/page.tsx:38` → `placeholder="e.g. leave.decided"`.
**Replacement:** **Search activity** with a select of human labels ("Leave decided", "Employee updated", "Payroll run"). Map labels to action codes internally.
**Clean checks:** no `statusText`, `Failed to fetch`, `NetworkError`, `AbortError` literals in source; no rendered `console.*`; no raw `JSON.stringify` in JSX; no `<pre>` outside system health; no table column or label literally named "ID". Zero literal hits does **not** mean zero exposure — L2 is the path by which native network text still reaches the DOM.
---

## 2. Raw identifier inventory

| # | Site | Evidence | What the user sees | Sev | Human-readable replacement |
|---|---|---|---|---|---|
| R1 | `app/hr/leave/page.tsx:79` | `{r.requester_name ?? r.employee_id.slice(0, 8)}` | `3f9a1c2b` where a person's name belongs | High | Resolve the name server-side. Fallback: **Employee name unavailable** / "Open the employee record to see who made this request." / **View employee**. Remove the UUID fragment. |
| R2 | `app/hr/recruitment/applications/page.tsx:67` | `{r.candidate_name ?? r.candidate_id.slice(0, 8)}` | `b41d77e0` as the candidate name | High | **Candidate name unavailable** / "Open the candidate record to review this application." / **View candidate**. Never slice an ID into a name. |
| R3 | `app/jobs/[slug]/apply/page.tsx:114,116` | `<p ... font-mono ...>{done.statusToken}</p>`; link `/application-status?token=${done.statusToken}` | Long bearer-like token printed on the success screen; also in URL | High | **Application received** / "We've saved your application. Copy a private status link, or check your email for updates." / **Copy status link** + **Back to roles**. Copy to clipboard only; do not print the token. |
| R4 | `app/application-status/page.tsx:9-10,50` | `useState(params.get("token") ?? "")`; `<TextInput value={token} ...>` | The raw token is prefilled and visible in the input | Medium | Label **Status link**, placeholder "Paste the link from your confirmation email." Keep the token in state/URL, not in a visible value. Invalid/expired → **This status link has expired** / "Ask the recruiter to send a new one." / **Request a new link**. |
| R5 | `app/admin/shards/page.tsx:144` | `<p ... font-mono ...>{p.process_id}</p>` | `api:4000:6f2a…` | Medium | **API process** + **Active 2 min ago** (from `heartbeat_at`), or an ordinal ("API process 1"). Remove `process_id`. |
| R6 | `app/admin/shards/page.tsx:155` | `{r.run_id.slice(0, 12)}… → {r.new_shard}` | `a1b2c3d4e5f6… → shard-4` | Medium | **Migration · 12 Oct 2026, 14:32** / status pill / **View progress**. Remove run ID and raw shard key. |
| R7 | `app/admin/shards/page.tsx:132`, `app/admin/system-health/page.tsx:62` | `{id}` (gate keys); `shard-4` labels at `shards:99-110` | `shard-1`, `shard-2`, `shard-4` | Medium | Map to **Primary database**, **Shard 2**, **Shard 4**. Keep the mapping in one client helper; never print the raw key. |
| R8 | `app/admin/audit-logs/page.tsx:58-59` | `{r.action}` in `font-mono`; `{r.resource} · {fmtTime(...)}` | `leave.decided` and `leave:9b2e…` / `employee:4c1a…` | Medium | **Priya Sharma approved leave** / "14–16 Oct 2026 · 12 Oct, 14:32". Add `actor` name and target label server-side; map action codes to human labels; never render `resource`. |
| R9 | `app/hr/recruitment/jobs/new/page.tsx:40,78` | `setShort(\`${base}/s/${s.code}\`)`; `<p ... font-mono>{short}</p>` | `http://localhost:4000/s/ab12cd` printed in the form | High | **Application link** / "Share this link with candidates." / **Copy link** + **View public page**. Build links from a configured public origin, never `API_BASE`, and never show a raw monospace URL. |
| R10 | `app/hr/employees/new/page.tsx:46,128` | `api<{ invitationId: string; token: string }>` (token discarded); copy says `Accept link: /register?token=… (token shown once at creation)` | A fake/partial route is shown, and no usable accept link exists | Medium | **Invitation emailed to {email}** / "They can accept it from their inbox." / **Resend invitation**. If email is unavailable, **Copy invitation link** (clipboard only, never rendered). Remove the `/register?token=…` text. |
| R11 | `app/hr/recruitment/sourcing/[id]/page.tsx:56` | `<span ... font-mono ...>{p.url}</span>` | `https://portal.example.com/candidates?page=3&token=…` in monospace | Medium | **Source page 3** / "portal.example.com" / **Open page** (safe `http(s)` link, host shown, query stripped). Never print full crawl URLs; they can contain tokens. |
**Not findings (verified clean):** UUIDs are otherwise used only as React keys and `href` values — allowed. `job_id`, `batch_id`, `record_id`, `request_id`, `user_id` and `notification_id` are not rendered as text. No table column or label is literally "ID". `display_id` exists on employee payloads but is never shown; if HR needs a human reference, render it as **Employee no. EMP-001**, not a UUID.
---

## 3. Error-path map
Legend: **P** = page-level error card; **I** = inline error; **N** = none (silent/skeleton); **R** = renders raw message; **F** = fixed friendly copy. Layer: `hr` = `lib/hr.ts`, `api` = `lib/api.ts`, `fetch` = direct `fetch`.

| Page | Load failure | Action failure | Layer |
|---|---|---|---|
| `/` | n/a (static) | n/a | none |
| `/login` | I (R fallback) | I (R) | fetch |
| `/forgot-password` | I (F) | I (F) | fetch |
| `/register` | I (R fallback) | I (R) | fetch |
| `/reset-password` | I (R fallback) | I (R) | fetch |
| `/application-status` | I (F); network unhandled | n/a | fetch |
| `/jobs` | S → "No open roles" masks outage | n/a | fetch (server) |
| `/jobs/[slug]` | S → `notFound()` for 5xx too | n/a | fetch (server) |
| `/jobs/[slug]/apply` | I (F); network unhandled | I (R) | fetch |
| `/dashboard` | S → blank cards, "Good day" | n/a | fetch |
| `/attendance` | P (R) | I (R) | hr |
| `/leave` | P (R) | I (R) | hr |
| `/leave/apply` | n/a | I (R) | hr |
| `/payroll` | P (F, no retry) | n/a | hr |
| `/payroll/[id]` | P (R) | n/a | hr |
| `/performance` | P (F) | n/a | hr |
| `/profile` | P (F) | I (R) | hr |
| `/notifications` | P (F) | I (R, under Title) | hr |
| `/settings` | P (R) | I (R); add dept/desig N | hr |
| `/manager/team` | P (F, no detail/retry) | n/a | hr |
| `/manager/team/[id]` | P (R) | n/a | hr |
| `/manager/leave` | P (F) | I (R) | hr |
| `/manager/performance` | P (F) | n/a | hr |
| `/manager/performance/[employeeId]` | I (R, inside review card) | I (R) | hr |
| `/hr/employees` | P (F, mislabels 403/5xx as sign-in) | n/a | fetch |
| `/hr/employees/new` | N (list load) | I (R) | api |
| `/hr/employees/[id]` | P (R) | I (R, ×3) | api |
| `/hr/attendance` | P (F, no retry) | I (R, modal) | fetch + hr |
| `/hr/attendance/reports` | P (F, mislabels network as "Restricted area") | n/a | hr |
| `/hr/leave` | P (F) | I (R) | hr |
| `/hr/payroll` | P (F, no retry) | n/a | hr |
| `/hr/payroll/batches/[batchId]` | N (`catch → "UNKNOWN"`, skeleton forever) | n/a | hr |
| `/hr/payroll/run` | n/a | I (R) | hr |
| `/hr/performance` | P (F, retry) | n/a | hr |
| `/hr/performance/cycles` | P (F) | I (R) | hr |
| `/hr/reports` | P (F, mislabels network as "Restricted area") | n/a | hr |
| `/hr/recruitment` | P (F) | n/a | hr |
| `/hr/recruitment/jobs` | I (F, no retry) | n/a | fetch |
| `/hr/recruitment/jobs/new` | n/a | I (R) | hr |
| `/hr/recruitment/applications` | P (F) | n/a | hr |
| `/hr/recruitment/applications/[id]` | P (R) | I (R) | hr |
| `/hr/recruitment/candidates` | P (F) | n/a | hr |
| `/hr/recruitment/candidates/[id]` | P (R) | n/a | hr |
| `/hr/recruitment/sourcing` | P (F) | I (R) | hr |
| `/hr/recruitment/sourcing/[id]` | N (`catch → "UNKNOWN"`, skeleton forever) | n/a | hr |
| `/admin/users` | P (F) | I (R) | hr |
| `/admin/roles` | P (F) | n/a | hr |
| `/admin/audit-logs` | P (F) | n/a | hr |
| `/admin/system-health` | P (R); metrics fetch S | n/a | hr + fetch |
| `/admin/shards` | P (R) | I (R) | hr |
**Systemic gaps:** (a) `hr.ts`/`api.ts` classify only 429 and 401; every other status is collapsed into one message. (b) Admin pages hardcode "Restricted area" for all failures. (c) Public/token routes (`login`, `register`, `reset-password`, `application-status`, apply) have no `catch`, so network failures produce no UI at all. (d) `hr/attendance/reports`, `hr/reports` treat network errors as permission errors. (e) `hr/payroll/batches/[batchId]` and `hr/recruitment/sourcing/[id]` never leave the skeleton.
---

## 4. Central recommendations (specification, no implementation)

### 4.1 Error contract

```ts
type UiErrorKind = "network" | "auth" | "forbidden" | "not_found" | "conflict"
  | "expired" | "validation" | "rate_limit" | "server" | "unknown";
interface UiError {
  kind: UiErrorKind;
  status?: number;                      // classification only; never rendered
  title: string; body: string;
  action: { label: string; kind: "retry" | "signin" | "back" | "refresh" | "none"; href?: string };
  retryable: boolean;
  fieldErrors?: Record<string, string>; // allowlisted field names only
  reference?: string;                   // clipboard-only; never rendered
}
function toUiError(error: unknown, context?: string): UiError;
```
`lib/api.ts` and `lib/hr.ts` must both throw `ApiError` (`status`, `code`, `userMessage`, `technicalMessage`) and must never forward `body.error.message`. `toUiError` reads `status` first, then an allowlist of known codes (`VALIDATION_ERROR`, `VERSION_CONFLICT`, `OVERLAP`, `INSUFFICIENT_BALANCE`, `DUPLICATE_APPLICATION`, `INVITATION_EXPIRED`, `STATUS_EXPIRED`, `TOKEN_INVALID`, `RATE_LIMITED`, `FORBIDDEN`, `NOT_FOUND`, `UNAUTHENTICATED`). Everything else is generic copy. Log `technicalMessage` to the console once; never to the DOM.

### 4.2 Status mapping

| Class | Trigger | Title | Body | Action |
|---|---|---|---|---|
| Network | fetch rejects | **We couldn't connect** | Check your internet connection and try again. | Try again |
| Session | 401 | **Your session has expired** | Sign in again to continue. | Sign in |
| Forbidden | 403 | **You don't have access** | Ask your administrator if you think you should have access. | Go back |
| Not found | 404 | **We couldn't find that record** | It may have been removed, or the link may be incorrect. | Back to list |
| Conflict | 409 | **This record has changed** | Refresh the page and try again. | Refresh |
| Expired | 410 | **This link has expired** | Ask the sender for a new link. | Request new link |
| Validation | 400 / 422 | **Check the highlighted fields** | Some details need attention. | Fix fields |
| Rate limit | 429 | **Too many attempts** | Wait a moment and try again. | Try again |
| Server | 5xx | **Something went wrong on our side** | Try again in a moment. If it continues, contact your administrator. | Try again |
| Unknown | — | **Something went wrong** | Try again. If it continues, contact your administrator. | Try again |
Overrides: login 401 → **Email or password is incorrect.**; register 409 → **That email is already registered. Try signing in instead.**; status/invite/reset 404/410 → expired-link copy; payroll 409 → **This payroll batch already exists** / "Open the existing batch instead."; duplicate application 409 → **You've already applied for this role.**

### 4.3 Presentation components

```ts
interface ErrorStateProps { title: string; body: string; actionLabel: string; onAction?: () => void;
  actionHref?: string; secondaryLabel?: string; secondaryHref?: string; }
interface AlertProps { tone: "success" | "warning" | "danger" | "info"; title?: string;
  children: React.ReactNode; action?: { label: string; onClick?: () => void; href?: string }; }
interface FieldProps { label: string; htmlFor: string; hint?: string;
  error?: string; /* allowlisted copy only */ required?: boolean; children: React.ReactNode; }
```
- **ErrorState:** page-level only, one per page; centered card, icon, title, body ≤ 60ch, one primary action. `role="alert"`, focus moves to the title on mount. Never accepts an exception object.
- **Alert:** inline outcome. `danger` uses `role="alert"`; `success` uses `role="status"`. Never used for full-page load failures.
- **Field:** error directly below the control, `aria-invalid`, `aria-describedby`, focus moves to the first invalid field. Backend messages are not passed through; unknown validation renders "Check this field."
- **EmptyState** stays for zero records only; never for failures. **SkeletonRows** only while a request is in flight; every skeleton has a timeout that becomes an ErrorState.

### 4.4 Identifier rules
- No `.employee_id`, `.candidate_id`, `.process_id`, `.run_id`, `.request_id`, `.application_id`, `.batch_id`, `.record_id`, `.user_id`, `.job_id`, `.cycle_id`, `.statusToken` in JSX text.
- No `.slice(0, 8)` / `.slice(0, 12)` fallbacks. Missing names become **Employee name unavailable** / **Candidate name unavailable** with a labelled link.
- Shard keys map to **Primary database**, **Shard 2**, … in one client helper. Migration runs display date/time + status, not `run_id`.
- Audit log displays actor name + action label + target label + time; map `action` codes to labels, join names server-side, never render `resource`.
- Tokens/secrets use **Copy link** / **Copy status link** actions; the value never appears in text, `<pre>`, or a visible input. Auth/status links travel in the URL only.
- If HR needs a reference, use `display_id` formatted as **Employee no. EMP-001**; prefer name + department everywhere else.
- Public links are built from `NEXT_PUBLIC_PUBLIC_ORIGIN` (or the request origin), never `NEXT_PUBLIC_API_BASE`; show a labelled link or copy button, not a monospace URL.
---

## 5. Verification checklist
Run from the repo root after remediation. Each command should return **zero matches** except the allowed exceptions below.

```bash
# 1. Exception text, HTTP fallbacks, network internals
rg -n -e '\(err as Error\)\.message' -e 'err\.message' -e 'error\.message' \
  -e 'body\?\.error\?\.message' -e 'request-failed:' -e 'statusText' \
  -e 'Failed to fetch' -e 'NetworkError' -e 'AbortError' -e 'ECONNREFUSED' -e 'TypeError' \
  apps/web/app apps/web/components apps/web/lib
# 2. Ops payloads and dev tools
rg -n -e '<pre' -e 'hrms_http_requests_total' -e 'Prometheus' -e 'Grafana' \
  -e 'Mailpit' -e 'localhost:9090' -e 'localhost:3001' -e 'localhost:8025' \
  apps/web/app apps/web/components
# 3. Machine IDs, tokens and monospace displays
rg -n -e '\{[^}]*\.(employee_id|candidate_id|process_id|run_id|statusToken|request_id|application_id|batch_id|record_id|user_id|job_id|cycle_id)\b' \
  -e '\.slice\(0, ?(8|12)\)' -e 'statusToken' -e 'resetToken' -e '\bcsrf\b' -e 'x-csrf-token' \
  -e 'font-mono' apps/web/app apps/web/components
# 4. ID columns/labels, jargon, console output, partial banners
rg -n -e '<th[^>]*>\s*(ID|Id|.*_id)\s*</th>' -e '>\s*ID\s*<' \
  -e '\b(shard|bucket|Prometheus|run_id|process_id|current_step|gate_state)\b' \
  -e 'console\.(log|error|warn|info|debug)' -e 'partial\.join' -e 'unavailable:' \
  apps/web/app apps/web/components
# 5. Raw JSON in JSX (request bodies are fine)
rg -n -e '\{JSON\.stringify' -e 'JSON\.stringify\([^)]*\)\}' apps/web/app apps/web/components
```
**Allowed exceptions (list in the remediation PR):**
- `apps/web/lib/api.ts` and `apps/web/lib/hr.ts` may read `sessionStorage.getItem("hrms_csrf")` and send `x-csrf-token`; the value is a header, never rendered. They may keep `process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000"` as a non-rendered dev default.
- `app/application-status/page.tsx`, `app/register/page.tsx`, `app/reset-password/page.tsx` may read `params.get("token")` for URL transport; the token must not be prefilled visibly.
- `JSON.stringify(...)` inside `fetch`/`authed` request bodies is allowed.
- `apps/web/e2e/**` and `docs/**` are out of scope and may contain banned terms as test fixtures/documentation.
- No `font-mono` exception is expected. If a genuine code sample is added later, name the file and justify it in the PR.
**Behavioral checks (not greppable):**
1. Playwright with `context.setOffline(true)` on `/attendance`, `/leave`, `/login`, `/jobs/*/apply`: assert **We couldn't connect**, never `Failed to fetch`.
2. Stub API 500/502/503 on a page: assert **Something went wrong on our side**, never `request-failed` or `No shard owns this record`.
3. Stub 401 and 403: assert **Your session has expired** / **You don't have access**, with the correct action.
4. Complete a public application: inspect the DOM — the status token must not appear as text; only a copy action.
5. Admin system health/shards: DOM contains no `process_id`, `run_id`, `shard-1`, metric names, or `localhost`.
6. Search the rendered text of every page for `request-failed`, `shard-`, `<uuid>`, `Failed to fetch`, `localhost`, `leave.decided`.
