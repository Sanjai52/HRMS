# UI Content Policy — errors, identifiers, and technical detail

> **Scope:** every user-facing surface in `apps/web` — app, admin, auth, public jobs, application status. The candidate portal (`apps/candidate-portal`, :4100) is fixture HTML and out of scope until it is rebuilt.
>
> **Status:** adopted for the UI revamp. This is a behavior rule, not a suggestion: a screen that leaks backend detail is not done.

---

## 1. Principles

1. **Explain the outcome, not the implementation.** The UI says what happened, what the person can do, and whether it is their fault. It never exposes how the system failed.
2. **Every error has a next step.** Retry, sign in, go back, refresh, or contact an administrator. A dead-end error message is a bug.
3. **Never blame the user.** No "Oops", no exclamation marks, no "invalid input" without naming the field, no jargon.
4. **Technical detail goes to logs, not the DOM.** Console/server logs may carry the raw error; the rendered UI may not.
5. **Identifiers are for machines; people get names.** Names, titles, periods, departments, dates and amounts are the vocabulary of the UI. UUIDs and database IDs are not.
6. **Empty is not an error.** A list with no records gets an `EmptyState` with a way to add the first record. An error gets an `ErrorState` with retry.
7. **One pattern per job.** Page-level failure = `ErrorState`. Inline failure = `Alert tone="danger"`. Field failure = `Field` error. Transient success = inline `Alert tone="success"` (no toast for errors that need action).
8. **Accessibility is part of the copy.** `role="alert"` for errors, `aria-describedby` for field errors, focus moves to the first invalid field, and the error is not conveyed by color alone.

---

## 2. Never render (hard bans)

| Category | Examples |
|---|---|
| Exception text | `error.message`, `err.toString()`, `String(error)`, `error.name`, stack traces |
| HTTP internals | `request-failed:500`, `HTTP 403`, `statusText`, endpoint paths, method names |
| API payloads | raw JSON, `body.error.details`, validation arrays, `P2002`, Prisma/Postgres/SQL text, table/column/constraint names |
| Network internals | `Failed to fetch`, `TypeError`, `NetworkError`, `AbortError`, `CORS`, `ECONNREFUSED` |
| Secrets | JWTs, CSRF values, reset tokens, application status tokens, session IDs, API keys |
| Machine IDs | UUIDs, numeric DB IDs, `employee_id`, `user_id`, `job_id`, `application_id`, `candidate_id`, `batch_id`, `record_id`, `request_id`, `process_id`, `run_id`, shard IDs, cycle IDs |
| Ops surfaces | Prometheus text, log lines, raw metrics `<pre>` blocks, stack traces, `localhost:9090` / `:3001` / `:8025` links in the product UI |
| Developer copy | "bug", "error code", "correlation ID", "unhandled", "null", "undefined", "NaN" |

**Allowed:** human-readable entity names, job titles, departments, pay periods, dates, amounts, safe field-level validation ("Enter a valid email address."), and a generic support line ("If this keeps happening, contact your HR administrator.").

If support genuinely needs a machine reference, provide a **Copy reference** action that copies the ID to the clipboard without rendering it. Do not print the ID "just in case".

---

## 3. Error taxonomy and exact copy

| Context | Trigger | Title | Body | Action |
|---|---|---|---|---|
| Page load / network | fetch rejects | **We couldn't load this page** | Check your connection and try again. | Retry |
| Session expired | 401 | **Your session has expired** | Sign in again to continue. | Sign in |
| Forbidden | 403 | **You don't have access** | Ask your administrator if you think you should. | Go back |
| Not found | 404 | **We couldn't find that record** | It may have been removed, or the link may be incorrect. | Back to list |
| Conflict | 409 | **This record has changed** | Refresh the page and try again. | Refresh |
| Validation | 400 / 422 | **Check the highlighted fields** | Some details need attention. | Fix fields |
| Rate limit | 429 | **Too many attempts** | Wait a moment and try again. | Retry |
| Server | 5xx | **Something went wrong on our side** | Try again in a moment. If it continues, contact your administrator. | Retry |
| Unknown | — | **Something went wrong** | Try again. If it continues, contact your administrator. | Retry |

**Form-level rules:**
- Show the field error under the field, not a single banner at the top.
- If the API returns a validation error, only render messages from a small allowlist of known, human-readable field errors. Otherwise show "Check the highlighted fields."
- Login: 401 = "Email or password is incorrect." Do not echo "user not found" (account enumeration).
- Register: 409 = "That email is already registered. Try signing in instead."
- Forgot password: always say "If an account exists for that email, we've sent a reset link." (no account enumeration).
- Application status: an invalid/expired token = "This status link has expired. Ask the recruiter to send a new one." Never echo the token.

---

## 4. Identifier display rules

| Entity | Show | Never show |
|---|---|---|
| Employee | Name + designation/department; avatar initials | `employee_id`, UUID |
| Manager / team | Name + role + department | `user_id`, `manager_id` |
| Job | Job title + department + location | `job_id`, raw slug as body text |
| Application | Candidate name + job title + stage | `application_id`, `statusToken` |
| Candidate | Name + email (masked if appropriate) + source | `candidate_id` |
| Payroll | Period label ("October 2026") + amount + status | `batch_id`, `record_id`, `payslip_id` |
| Leave / attendance | Date range + employee name + type | `request_id`, `attendance_id` |
| Audit log | Actor name + action label + target name + timestamp | actor/target UUIDs |
| System health | Human label ("Primary database", "Shard 2") + status + counts | `process_id`, `run_id`, shard keys, Prometheus text |
| Shards | "Primary", "Shard 2", … + status | raw shard IDs, migration run IDs |

**URLs** may contain IDs. That is fine; do not render the URL as text. **Slugs/short links** are URLs: display them as a labeled link or a "Copy link" button, never as a raw monospace string in the middle of a form.
**Tokens/secrets** must never be rendered, even on a success screen. The URL may carry them where the flow requires it.

---

## 5. Implementation contract

### 5.1 Shared helpers

`apps/web/lib/errors.ts`:
```ts
export class ApiError extends Error {
  status: number;
  code?: string;
  userMessage: string;
  technicalMessage?: string;
  retryable: boolean;
}

export function toUserMessage(
  error: unknown,
  fallback = "Something went wrong. Try again."
): { title: string; body: string; action: "retry" | "signin" | "back" | "refresh" | "none" };
```

`apps/web/lib/api.ts` and `apps/web/lib/hr.ts` must both throw `ApiError`, never `new Error(body?.error?.message)` and never `request-failed:${status}`.

`apps/web/lib/format.ts`:
```ts
export function fmtDay(iso: string | null | undefined): string;
export function fmtTime(iso: string | null | undefined): string;
export function fmtMoney(paise: number): string;
export function periodLabel(period: string): string;      // "2026-10" -> "October 2026"
export function initials(name: string): string;
export function safeHttpUrl(value: string): string | null; // only http/https
```

### 5.2 Presentation components

`apps/web/components/feedback.tsx`:
- `ErrorState({ title, body, actionLabel, onAction, secondary? })` — page-level card, `role="alert"`, icon, retry/sign-in/back.
- `Alert({ tone: "success" | "warning" | "danger" | "info", title?, children })` — inline, `role="alert"` for danger.
- `LoadingState({ rows? })` — skeleton matching the layout; `aria-busy`.

`apps/web/components/ui.tsx`:
- `Field` uses `text-danger` for errors and wires `aria-describedby`.
- `StatusPill` uses the five-tone map; unknown values fall back to neutral and log a dev-only warning.
- `EmptyState` supports an optional action (never used for errors).

### 5.3 Enforcement

Before a task is declared done, run these checks from the repo root:

```bash
rg -n "\(err as Error\)\.message|error\.message|request-failed:|Failed to fetch|statusText" apps/web/app apps/web/components apps/web/lib
rg -n "<pre|hrms_http_requests_total|process_id|run_id|statusToken" apps/web/app apps/web/components
rg -n "font-mono" apps/web/app   # review every hit; only code/token demos may remain
```

Allowed exceptions must be listed in the task report. Zero unexplained hits.

---

## 6. Copy style

- Sentence case for titles and buttons ("Try again", not "Try Again").
- Active voice, plain verbs: "We couldn't save your changes", not "Mistakes were made."
- No exclamation marks. No "Oops". No cute metaphors.
- One sentence for the outcome, one for the next step.
- Reference the person's data, not the system: "We couldn't load your team", not "The employees endpoint failed."
- If a number is shown, format it: `₹48,500.00`, `12 Oct 2026`, `3 days left`.

---

## 7. Acceptance checklist

- [ ] No raw exception, HTTP status, endpoint, JSON, SQL, log or metrics text is rendered anywhere.
- [ ] No raw UUID/database ID is rendered; every entity is identified by a human label.
- [ ] No token/secret is rendered.
- [ ] Every page has loading, empty, error and success states.
- [ ] Every error has a next step (retry/sign in/back/refresh/contact).
- [ ] Form errors are field-level and focus moves to the first invalid field.
- [ ] `rg` checks above return zero unexplained hits.
- [ ] Playwright review with an invalid session shows friendly copy, not "Failed to fetch" or "request-failed:401".
- [ ] Admin system health shows human-readable status, not Prometheus/log text.
