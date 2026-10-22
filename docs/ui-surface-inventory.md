# HRMS Web — UI Surface Inventory & Revamp Ownership

Read-only inventory of `apps/web`, baseline taken 2026-10-19 at the start of Task 1. This audit changed no code and made no commits. Scope is every `apps/web/app/**/page.tsx` plus the shared components and libs those pages consume. Phase 0 foundation work (`globals.css`, `layout.tsx`) was landing in the working tree in parallel, so the page-level risks below describe the pre-Phase-0 baseline.

**Count correction:** the repo contains **50** `page.tsx` routes, not ~52. Of these, **41 render inside `AppShell`**; **9** are auth or public surfaces.

**Shared primitive usage (source-verified):** `Card` 49 pages, `SkeletonRows` 37, `Button` 28 (+2 pages via `DecisionButtons`), `StatusPill` 25, `Field` 19, `TextInput` 22, `lib/hr.ts` 37, `lib/api.ts` 4 pages + shell. `EmptyState` is exported in `components/ui.tsx:79` but used by **0** pages.

**Cross-cutting findings (pre-Phase-0 baseline):** `globals.css` defined the Airbnb legacy palette (`rausch`, `hof`, `foggy`, `pearl`, `babu`, `arches`), 12px `--radius-card`, 8px `--radius-input`, black-alpha `shadow-card`/`shadow-pop`, and `Circular` without a shipped webfont. Phase 0 has since added semantic tokens, DM Sans (via `layout.tsx`) and 8px/6px radii in the working tree, but pages still use legacy classes: `rounded-full` 75 occurrences; `font-extrabold` 45 occurrences across 24 page files. No `font-extralight`/`font-thin` was found — overuse of extrabold, not extralight, is the observed weight problem. `StatusPill` colors only `ACTIVE`; every other status is grey. There is no global `app/error.tsx`, `app/loading.tsx` or `app/not-found.tsx`. Source paths in the table are relative to `apps/web`.

## Legend

| Code | Meaning |
|---|---|
| Layout `AS` | `AppShell` (`components/app-shell.tsx`) |
| Layout `Auth` | Standalone auth layout, no shell |
| Layout `Public` | Public marketing/jobs layout, no shell |
| Data `api` / `hr` | `lib/api.ts` (`api`, `rolesOf`) / `lib/hr.ts` (`authed`, `authedMeta`, `fmtDay`, `fmtTime`) |
| Data `fetch` / `SSR` | Direct browser `fetch` inside page / server-component `fetch` with revalidate |
| UI `Btn Card Field Input Pill Skel` | `Button`, `Card`, `Field`, `TextInput`, `StatusPill`, `SkeletonRows` from `components/ui.tsx` |
| UI `Decision` / `JobsSearch` | `components/leave-decision.tsx` / `components/jobs-search.tsx` |

## Route inventory

| # | Route | Source | Layout | Data sources | Shared UI | Current design risks (evidence) | Cx | Wave |
|---:|---|---|---|---|---|---|:--:|:--:|
| 1 | `/dashboard` | `app/dashboard/page.tsx` | AS | `fetch` ×6 (me, attendance, leave, payroll, notifications, directory) + `rolesOf` | Card, Skel | Six uncoordinated fetches; local `rupees()`/initials; privileged directory block has no role-specific empty/CTA; signed-out and request failure collapse into one error card; extrabold metrics | L | A |
| 2 | `/hr/employees` | `app/hr/employees/page.tsx` | AS | `fetch` `/employees?q&limit=30` | Card, Input, Skel, Pill | Hard 30-row cap and no count/pagination; hand-rolled 48px search button; generic error conflates 401, 403 and network; binary status pill; rows are links with no selection/actions | M | A |
| 3 | `/hr/employees/new` | `app/hr/employees/new/page.tsx` | AS | `api` | Btn, Card, Field, Input, Pill | Invitation `token` is returned then discarded (`void out`, lines 46–71), while the UI tells HR to share `/register?token=…` (line 128); raw API error; hand-rolled inline status text | M | A |
| 4 | `/hr/employees/[id]` | `app/hr/employees/[id]/page.tsx` | AS | `api` (profile, salary, activity) | Btn, Card, Field, Input, Pill, Skel | Pill-shaped tab row; raw error strings; `window.confirm`; local `rupees()`; two forms plus an access card in one column; activity fetched once with no retry; **contains payroll structure + payroll tab owned by A, not C** | L | A |
| 5 | `/manager/team` | `app/manager/team/page.tsx` | AS | `hr` | Card, Skel, Pill | Generic error with no cause or retry; no search/sort; binary pill; 48px rows are too airy for a team list | S | A |
| 6 | `/manager/team/[id]` | `app/manager/team/[id]/page.tsx` | AS | `hr` (profile + activity) | Card, Skel, Pill | Raw error string; no retry; empty attendance/leave has prose but no action; payroll array typed but never rendered; extrabold name | M | A |
| 7 | `/attendance` | `app/attendance/page.tsx` | AS | `hr` | Btn, Card, Skel | Raw ISO `workday` shown (line 98); hand-rolled status span instead of `StatusPill`; no composed empty state; action error repeated below card; only check-in/out action | M | B |
| 8 | `/leave` | `app/leave/page.tsx` | AS | `hr` | Card, Skel, Pill | Cancel has no confirmation; balances fall back to inline prose; binary pill; local date formatting; row action is a small underlined link | M | B |
| 9 | `/leave/apply` | `app/leave/apply/page.tsx` | AS | `hr` | Btn, Card, Field, Input | Native select; no client-side start/end ordering validation; raw error; form is a single bare card with no context or balance preview | S | B |
| 10 | `/hr/leave` | `app/hr/leave/page.tsx` | AS | `hr` | Card, Skel, Pill, Decision | `requester_name ?? employee_id.slice(0, 8)` raw-ID fallback (line 79); five filter pills; generic error drops the cause; vague “Nothing here.” | M | B |
| 11 | `/manager/leave` | `app/manager/leave/page.tsx` | AS | `hr` | Card, Skel, Pill, Decision | Queue shows leave type but not the requester’s name/team; filter pills; generic error; `DecisionButtons` shared by both B pages only | M | B |
| 12 | `/hr/attendance` | `app/hr/attendance/page.tsx` | AS | `fetch` day + `hr` corrections | Btn, Card, Field, Input, Skel | Raw date strings; status span not `StatusPill`; modal has `aria-modal` but no focus trap/Escape; raw error; flex rows imitate a table; bespoke partial banner | L | B |
| 13 | `/hr/attendance/reports` | `app/hr/attendance/reports/page.tsx` | AS | `hr` `authedMeta` | Btn, Card, Field, Input, Skel | Two raw `<table>`s with overflow only: no mobile card fallback, no `aria-sort`, no caption; ISO day values; any failure becomes “Restricted area”; bespoke partial banner | L | B |
| 14 | `/payroll` | `app/payroll/page.tsx` | AS | `hr` | Card, Skel | Generic “Sign in” card for every failure; no period grouping or status; 48px rows | S | C |
| 15 | `/payroll/[id]` | `app/payroll/[id]/page.tsx` | AS | `hr` | Card, Skel | Raw error; local `rupees()`; no print/download; “demonstration” copy; flat `dl` with no earnings/deductions sections | S | C |
| 16 | `/hr/payroll` | `app/hr/payroll/page.tsx` | AS | `hr` | Card, Skel, Pill | Generic error; no `EmptyState`; batch progress is text only; no period filter | S | C |
| 17 | `/hr/payroll/run` | `app/hr/payroll/run/page.tsx` | AS | `hr` | Btn, Card, Field, Input | Hardcoded default period `2026-09` (line 10); raw error; no preview/confirmation before queueing | S | C |
| 18 | `/hr/payroll/batches/[batchId]` | `app/hr/payroll/batches/[batchId]/page.tsx` | AS | `hr` (2s polling) | Card, Skel, Pill | Polling swallows errors into `UNKNOWN` (lines 34–42), leaving a forever skeleton; no per-record failure state; local `rupees()`; progress bar only | M | C |
| 19 | `/performance` | `app/performance/page.tsx` | AS | `hr` | Card, Skel | Generic error; bespoke progress bars; no cycle context; empty prose instead of `EmptyState` | M | C |
| 20 | `/hr/performance` | `app/hr/performance/page.tsx` | AS | `hr` | Btn, Card, Skel | Rating distribution is one text line (line 100); generic error; no status; KPI cards have no trend/denominator context | M | C |
| 21 | `/hr/performance/cycles` | `app/hr/performance/cycles/page.tsx` | AS | `hr` | Btn, Card, Field, Input, Skel, Pill | Close action has no confirm and no catch (lines 95–99); raw error; create form and list compete for hierarchy | M | C |
| 22 | `/manager/performance` | `app/manager/performance/page.tsx` | AS | `hr` | Btn, Card, Skel, Pill | Generic error; no cycle selection; duplicates `/manager/team` loading logic; binary pill | S | C |
| 23 | `/manager/performance/[employeeId]` | `app/manager/performance/[employeeId]/page.tsx` | AS | `hr` | Btn, Card, Field, Input, Pill, Skel | Notice rendered in error color `text-rausch-dark` (line 163); raw errors; no active-cycle empty state; review feedback has no required state; goal/review lists are flat rows | L | C |
| 24 | `/hr/reports` | `app/hr/reports/page.tsx` | AS | `hr` `authedMeta` | Card, Skel, Pill | Bespoke progress bars and partial banner; “Restricted area” for every failure; no date range; payroll rows show no amounts | M | C |
| 25 | `/hr/recruitment` | `app/hr/recruitment/page.tsx` | AS | `hr` (all applications) | Card, Skel | Counts every application client-side (lines 15–18); eight equal KPI cards with no funnel; generic error | M | D |
| 26 | `/hr/recruitment/jobs` | `app/hr/recruitment/jobs/page.tsx` | AS | `fetch` `/jobs` | Card, Skel, Pill | Management list uses the public jobs endpoint but has no edit/close actions; fetch failure and “no open roles” look identical; generic error inside a card | S | D |
| 27 | `/hr/recruitment/jobs/new` | `app/hr/recruitment/jobs/new/page.tsx` | AS | `hr` | Btn, Card, Field, Input | Description is a one-line input (line 62); short URL built from API origin (line 40), not the public web origin; raw error | M | D |
| 28 | `/hr/recruitment/candidates` | `app/hr/recruitment/candidates/page.tsx` | AS | `hr` | Card, Skel, Input | Hand-rolled source chip; no pagination; prose empty state; no bulk actions | S | D |
| 29 | `/hr/recruitment/candidates/[id]` | `app/hr/recruitment/candidates/[id]/page.tsx` | AS | `hr` | Card, Skel, Pill | Raw error; applications labelled only “Application” with no job title; no back link; skills are comma text | S | D |
| 30 | `/hr/recruitment/applications` | `app/hr/recruitment/applications/page.tsx` | AS | `hr` | Card, Skel, Pill | `candidate_id.slice(0, 8)` fallback (line 67); nine filter pills; no pagination; generic error; no job column | M | D |
| 31 | `/hr/recruitment/applications/[id]` | `app/hr/recruitment/applications/[id]/page.tsx` | AS | `hr` | Btn, Card, Field, Input, Pill, Skel | Interview/assessment POSTs have no try/catch (lines 122–180); no empty states; raw stage labels; one-step stage advance; history omits `changed_by` | L | D |
| 32 | `/hr/recruitment/sourcing` | `app/hr/recruitment/sourcing/page.tsx` | AS | `hr` (5s polling) | Btn, Card, Field, Input, Skel, Pill | Fixed 5s polling with no backoff/stop control; raw error; no confirmation before crawl; binary pill | M | D |
| 33 | `/hr/recruitment/sourcing/[id]` | `app/hr/recruitment/sourcing/[id]/page.tsx` | AS | `hr` (3s polling) | Card, Skel, Pill | Polling swallows errors (lines 24–26); no error/empty UI; raw URLs; hand-rolled HTTP status chips | S | D |
| 34 | `/notifications` | `app/notifications/page.tsx` | AS | `hr` + `rolesOf` | Btn, Card, Field, Input, Skel | `markRead` has no error handling (lines 59–62); body truncated to one line; bespoke unread dot; announcement permission checked only client-side | M | D |
| 35 | `/admin/users` | `app/admin/users/page.tsx` | AS | `hr` | Btn, Card, Skel, Pill | Dense inline four-role checkbox matrix; `window.confirm` (line 71); raw API error; `limit=100` no pagination; actions wrap badly on mobile | L | D |
| 36 | `/admin/roles` | `app/admin/roles/page.tsx` | AS | `hr` | Card, Skel | 14×5 `<table>` with `min-w-[760px]` and overflow only: no mobile fallback, no `aria-sort` (lines 72–93); counts show “—” while loading | M | D |
| 37 | `/admin/audit-logs` | `app/admin/audit-logs/page.tsx` | AS | `hr` | Btn, Card, Input, Skel | `actor` is fetched but never rendered; raw resource strings; no pagination; fixed 50-row cap | S | D |
| 38 | `/admin/system-health` | `app/admin/system-health/page.tsx` | AS | `hr` + `fetch /metrics` | Btn, Card, Skel, Pill | Hardcoded `localhost` links (lines 72–80); raw Prometheus `<pre>`; `/metrics` failure leaves “Loading…” forever; mixed error model | M | D |
| 39 | `/admin/shards` | `app/admin/shards/page.tsx` | AS | `hr` (3s polling) | Btn, Card, Skel, Pill | Hardcoded `shard-4` (lines 59–69); `window.confirm`; run IDs `slice(0, 12)`; poll errors swallowed; page error only when no info | L | D |
| 40 | `/settings` | `app/settings/page.tsx` | AS | `hr` | Btn, Card, Field, Input, Skel | “Holidays 2026” hardcoded (line 157); department/designation submits have no catch (lines 112–143); mixes notification prefs with admin config; generic restricted card | L | D |
| 41 | `/profile` | `app/profile/page.tsx` | AS | `hr` | Btn, Card, Field, Input, Pill, Skel | Only name is editable; raw error; disabled email has no explanatory helper; no avatar/contact fields; binary status | M | D |
| 42 | `/login` | `app/login/page.tsx` | Auth | `fetch` | none (raw inputs/button) | Prefilled demo email `hr@hrms.local` (line 7); no password reveal; raw inputs bypass `ui.tsx`; no remember-me; coral/pill legacy | S | E |
| 43 | `/register` | `app/register/page.tsx` | Auth | `fetch` | Btn, Card, Field, Input | Token is an editable text field; no invitation context (name/email); error renders under the confirm field (line 66); no password strength | S | E |
| 44 | `/forgot-password` | `app/forgot-password/page.tsx` | Auth | `fetch` | Btn, Card, Field, Input | Error only under email; no resend timer; coral/pill legacy; success state has no card chrome | S | E |
| 45 | `/reset-password` | `app/reset-password/page.tsx` | Auth | `fetch` | Btn, Card, Field, Input | Editable token; raw server error in confirm field; no expired-link recovery; only `minLength=8` | S | E |
| 46 | `/` | `app/page.tsx` | Public | none | Btn, Card | 60px/800 hero; generic Unsplash images (lines 50–55, 89–94); three equal feature cards (59–73); duplicate “Sign in” CTAs; no `next/image`/skip link | L | E |
| 47 | `/jobs` | `app/jobs/page.tsx` | Public | SSR `fetch` + JobsSearch | Card | Fetch failure returns `[]` indistinguishably from “no roles” (lines 6–12); no error boundary; `employment_type` assumed non-null (line 47); generic card grid | M | E |
| 48 | `/jobs/[slug]` | `app/jobs/[slug]/page.tsx` | Public | SSR `fetch` | Card | Raw ISO `closing_date` (line 57); apply CTA has no closed/expired state; no metadata/OG; no breadcrumb | S | E |
| 49 | `/jobs/[slug]/apply` | `app/jobs/[slug]/apply/page.tsx` | Public | `fetch` + multipart POST | Btn, Card, Field, Input | Hand-rolled file input with no type/size guard (line 98); status token ellipsized (line 114); no job title in form; raw error | M | E |
| 50 | `/application-status` | `app/application-status/page.tsx` | Public | `fetch` | Btn, Card, Field, Input, Pill | `applied_at` is fetched but never shown; generic error; no link back to the job; editable token | S | E |

## Shared-file ownership (agents must NOT edit these)

Phase 0 is the **shared foundation**, run before Wave A. It is the only writer for the files below. Wave agents import the results and edit only their own `page.tsx` (plus wave-owned components).

| File | Consumers | Owner | Required before waves |
|---|---|---|---|
| `apps/web/app/globals.css` | All 50 pages | **Phase 0** | Semantic tokens, DM Sans/fallback, 6px controls, 8px cards, tinted shadows; baseline 12px card radius removed in working tree; no page-level hex/radius |
| `apps/web/app/layout.tsx` | All 50 pages | **Phase 0** | DM Sans, body surface/ink and metadata added in working tree; no per-page layout hacks |
| `apps/web/components/ui.tsx` | 49 Card, 37 Skel, 28 Btn (+2 DecisionButtons), 25 Pill, 19 Field, 22 Input | **Phase 0** | One button height scale, squared actions, Card radius, complete `StatusPill` map, usable `EmptyState`; `EmptyState` currently unused |
| `apps/web/components/app-shell.tsx` | All 41 `AS` pages | **Phase 0** | 56px topbar, 240px nav, page title/description/action contract; topbar search currently hardcodes `/hr/employees` |
| `apps/web/lib/api.ts` | Dashboard, employee new, employee detail, notifications + shell | **Phase 0** | Safe error normalization, 401 behavior, role parsing; no page-local fetch wrappers |
| `apps/web/lib/hr.ts` | 37 pages | **Phase 0** | Stable `authed`/`authedMeta` contract; move formatting out to `lib/format.ts` |
| `apps/web/lib/cn.ts` | `ui.tsx`, `app-shell.tsx` | **Phase 0** | Keep stable; no wave edits |
| `apps/web/lib/errors.ts` *(new)* | All API-calling pages | **Phase 0** | Single error-to-copy mapper; stop raw `err.message` |
| `apps/web/lib/format.ts` *(new)* | 5 `rupees()` pages, 15 `fmtDay/fmtTime` pages, raw-date pages | **Phase 0** | Currency, date, time, period, status-label helpers |
| `apps/web/components/feedback.tsx` *(new)* | All pages with alerts/empty/errors | **Phase 0** | `Alert`, `InlineError`, `Toast`, success/partial states; replaces ad-hoc banners |
| `apps/web/components/leave-decision.tsx` | `/hr/leave`, `/manager/leave` | **Wave B** | Both consumers are B; safe to edit inside B |
| `apps/web/components/jobs-search.tsx` | `/jobs` | **Wave E** | Single consumer; safe inside E |

If a page needs a new primitive or variant, Phase 0 adds it. Wave agents must not fork `ui.tsx` patterns into pages.

## Conflict map

| Shared change | Pages needing it | Phase that must handle it | Conflict note |
|---|---|---|---|
| Theme, font, radius, shadow, surface | All 50 | Phase 0 | A page-local class override would fragment every later wave |
| Shell/header/title/action contract | All 41 `AS` pages | Phase 0 | Pages cannot add description/actions until AppShell exposes slots; shell search destination is currently hardcoded |
| Button/Card/Field/StatusPill/Skeleton visual API | 28 Btn (+2 DecisionButtons), 49 Card, 19 Field, 22 Input, 25 Pill, 37 Skel pages | Phase 0 | Local pill buttons and 48px heights are the largest duplication: 75 `rounded-full` and 45 `font-extrabold` occurrences |
| Status semantics | 25 `Pill` pages plus hand-rolled chips/dots in `/attendance`, `/hr/attendance`, `/hr/recruitment/candidates`, `/hr/recruitment/sourcing/[id]`, `/notifications` | Phase 0 for `StatusPill`; owning wave replaces local chips | Fixing only one page creates two status languages |
| Error/alert/empty contract | Every API-calling page; 3 `window.confirm` pages: `/hr/employees/[id]`, `/admin/users`, `/admin/shards` | Phase 0 for components; owning wave for call sites | Raw `(err as Error).message` is widespread; do not invent per-page alerts |
| Formatting contract | 5 `rupees()` pages; 15 `fmtDay/fmtTime` pages; raw dates in `/attendance`, `/hr/attendance`, `/hr/attendance/reports`, `/jobs/[slug]` | Phase 0 | Prevents five currency implementations drifting |
| Employee record contains payroll | `/hr/employees/[id]` (A) vs `/payroll/*`, `/hr/payroll/*` (C) | **Wave A owns the employee file; Wave C owns payroll files** | Real cross-wave domain overlap. C must not edit the employee page; A uses Phase 0 format helpers |
| Team detail links to performance | `/manager/team/[id]` (A) links `/manager/performance/[employeeId]` (C) | A owns source; C owns target | Link-only dependency; no shared edit |
| Recruitment links to public jobs | `/hr/recruitment/jobs` (D) links `/jobs/[slug]` (E) | D owns management; E owns public | D must not edit public pages or `JobsSearch` |
| Leave decision component | `/hr/leave` + `/manager/leave` (both B) | Wave B | No D/C consumer; no conflict |
| Settings vs notifications | `/settings` + `/notifications` (both D) | Wave D | Same wave; settings also contains notification prefs |
| Auth imports primitives | `/register`, `/forgot-password`, `/reset-password` (E) | Phase 0 primitives; E pages | E must wait for Phase 0 before styling auth |
| AppShell Bell has no unread badge | `/notifications` and all shell pages | Phase 0 | Adding a live badge touches shared shell; do not do it inside D |
| Global 404/error/loading states | All routes; no `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx` exist | Phase 0 | Per-page error cards are currently the only fallback |

**Net ownership conflicts found:** none if Phase 0 is respected. The only substantive cross-wave domain overlap is `/hr/employees/[id]` (A) containing salary structure and payroll activity (C); it must stay wholly in A.

## Recommended wave order

| Order | Wave | Pages | S/M/L | Relative effort | Why this order |
|---:|---|---:|---:|---:|---|
| 0 | Foundation | 0 pages | — | 3–5 days | Tokens, font, primitive API, shell contract, error/format helpers. Blocks every wave |
| 1 | **A** dashboard + employees + manager team | 6 | 1/3/2 | 7.5 units | Pilot; proves shell, cards, statuses and directory patterns on the riskiest employee record |
| 2 | **B** attendance + leave | 7 | 1/4/2 | 8.5 units | Dense operational rows, approvals and tables; reuses A patterns; owns `DecisionButtons` |
| 3 | **C** payroll + performance + reports | 11 | 5/5/1 | 9.5 units | Reuses A/B primitives; payroll and reports are the most numeric surfaces |
| 4 | **D** recruitment + notifications + admin + settings/profile | 17 | 5/8/4 | 18.5 units | Largest wave; split safely into D1 recruitment (9 pages) and D2 notifications/admin/settings/profile (8 pages); files are disjoint |
| 5 | **E** auth + public jobs + landing | 9 | 6/2/1 | 7.0 units | After primitives freeze; public brand layer can diverge from product shell without blocking product waves |
| | **Total** | **50** | **18/22/10** | **51.0 units** | Effort units: S=0.5, M=1, L=2; foundation excluded |

A → B → C → D → E is the safe serial order. D1/D2 and E may run in parallel once Phase 0 and one pilot wave have landed; no page files overlap.

## Out of scope for the visual revamp

| Surface | Why excluded |
|---|---|
| Candidate portal at `http://localhost:4100` | Separate Express app, `apps/candidate-portal/src/index.mjs`; deliberately malformed HTML/unclosed tags for crawler fixtures (lines 84–86), no React, no shared CSS. It is a scraping target, not a product surface |
| `apps/web/e2e/**` | Playwright helpers/tests, not rendered routes |
| `apps/api`, `apps/worker`, `infrastructure/**` | No user-facing UI; endpoints are data sources only |
| `/metrics`, Prometheus, Grafana, Mailpit links | External/dev observability destinations; the hosting page `/admin/system-health` is in D, the destinations are not |
| `Reference/Velura/**` | Design reference material only |
| Fixture/test `page.tsx` routes under `apps/web/app` | None found; all 50 files are product/auth/public routes |

**Verification basis:** `find apps/web/app -name page.tsx` (50), `grep` counts for imports/utility usage, direct reads of all 50 pages and all shared files. This audit changed no code, config, lockfile or commit; this document is its only write. The `globals.css`/`layout.tsx` modifications in the working tree belong to the parallel Phase 0 foundation task.
