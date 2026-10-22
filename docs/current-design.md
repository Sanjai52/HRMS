# Current design inventory — HRMS web UI (as-is)

> **What this is.** A factual, token-by-token snapshot of the product UI exactly as it ships today — every color (hex), where it is used, the type scale, radii, shadows, and component recipes. Audited on branch `ui-tweaks`, 2026-10-19, against `apps/web` at `:3000`.
>
> **What this is not.** The target design. Intended direction lives in `docs/design-system.md` (canonical token doc) and `docs/design.md` (Airbnb language reference). This file records reality — including drift from those docs — so the premium-SaaS revamp has a precise baseline.

---

## 0. Where the design lives

| Concern | Source |
|---|---|
| Color tokens, font stack, shadows, radii, selection color | `apps/web/app/globals.css` (Tailwind v4 `@theme` — no `tailwind.config`) |
| Primitives: Button, Card, Field, TextInput, StatusPill, EmptyState, SkeletonRows | `apps/web/components/ui.tsx` |
| App shell: sidebar, topbar, search, account menu, mobile drawer | `apps/web/components/app-shell.tsx` |
| Landing page | `apps/web/app/page.tsx` |
| Everything else | page-level Tailwind class strings under `apps/web/app/**` |

Facts about the setup:

- Only one CSS file exists (`globals.css`). No CSS modules, no style-in-JS, no inline color styles (inline `style` is used only for progress-bar `width`).
- No dark mode — `dark:` variants are never used.
- **No webfont is shipped.** The `Circular` family is declared first in the stack but has no `@font-face` and no files; rendering falls back to the OS UI font (Segoe UI on Windows, Roboto/Helvetica elsewhere).
- `apps/candidate-portal` (port 4100) is intentionally programmer-art fixture HTML — bare `<html><body><main>`, browser default styles. It is **not** part of the visual language.

Method: source audit + live computed styles (Chrome via Playwright `browser_evaluate` on `localhost:3000`) + the Tailwind v4 compiled output (which enumerates every color utility actually used). Rendered RGB values quoted below are sampled, not assumed.

---

## 1. The palette (exact)

Nine color tokens, defined once in `apps/web/app/globals.css`:

| Token | Hex | RGB | Var | Role in one line |
|---|---|---|---|---|
| `rausch` | `#FF5A5F` | rgb(255, 90, 95) | `--color-rausch` | The single brand accent: primary buttons, logo, unread dots, progress, checked checkboxes |
| `rausch-dark` | `#E0484D` | rgb(224, 72, 77) | `--color-rausch-dark` | Primary hover state, inline error text, avatar-chip text, dark-red links |
| `babu` | `#00A699` | rgb(0, 166, 153) | `--color-babu` | Success only: approve buttons, success banners, ACTIVE status, done-progress |
| `arches` | `#FC642D` | rgb(252, 100, 45) | `--color-arches` | Warning only: warning banners, override action, error/status chips |
| `hof` | `#484848` | rgb(72, 72, 72) | `--color-hof` | Default text color; dark buttons/avatars; active tabs & chips; CTA band |
| `foggy` | `#767676` | rgb(118, 118, 118) | `--color-foggy` | Secondary text, idle nav, placeholders, neutral pill/status |
| `pearl` | `#F7F7F7` | rgb(247, 247, 247) | `--color-pearl` | Hover surfaces, quiet buttons, auth floor, skeletons, progress tracks |
| `line` | `#DDDDDD` | rgb(221, 221, 221) | `--color-line` | Input borders, search-pill border, read-dot, dashed empty-state border |
| `line-soft` | `#EBEBEB` | rgb(235, 235, 235) | `--color-line-soft` | Hairlines: card borders, dividers, sidebar/topbar/footer edges |

Specials (not tokens):

| Value | Where |
|---|---|
| `#FFFFFF` | Page floor (`html` + `body`), cards, inputs, panels, text on dark/accent fills |
| `#000000` | **Hover only**, on `hof`-filled surfaces (`hover:bg-black`) and one link (`hover:text-black`) — the only black in the UI |
| `#FFE8E9` | `::selection` background (pale rausch tint) |

---

## 2. Usage map — where each color is used

### Rausch `#FF5A5F`

- **Primary buttons** — `bg-rausch text-white hover:bg-rausch-dark` everywhere: login/register submit, landing hero CTA, job "Apply", "Run payroll", "Create job", "Save changes", etc. *Sampled live: button fill rgb(255,90,95), hover rgb(224,72,77).*
- **Logo mark** — white "H" on rausch square: `h-8 w-8 rounded-lg` (8px) on public pages, `h-9 w-9 rounded-card` (12px) in the sidebar, `rounded-md` (6px) in the footer.
- **Wordmark** — "HRMS" set in `text-rausch` (everything else heading-like is `hof`).
- **Unread notification dot** — `h-2 w-2 rounded-full bg-rausch` (read = `bg-line`); notifications page L106.
- **Icon tiles** — tinted `bg-rausch/10 text-rausch` (`h-12 w-12 rounded-card`): dashboard payslip card, landing feature cards.
- **Progress fills (accent)** — reports bars and performance completion: `bg-rausch` on a `bg-pearl` track.
- **Checkboxes** — native control with `accent-rausch` (admin users L140, settings).
- **Inline links (emphasis/danger-adjacent)** — `text-rausch-dark hover:underline` (admin user → employee record link).
- **Error banners** — `rounded-card border border-rausch/30 bg-rausch/10 px-4 py-3 text-sm font-medium text-rausch-dark` (admin users L97, attendance correction dialog L187).
- **Danger outline action** — "Deactivate employee": `border border-rausch text-rausch-dark hover:bg-rausch/10` (record page L276).

### Rausch-dark `#E0484D`

- Hover of every primary button (`hover:bg-rausch-dark`).
- Field/error text — `text-rausch-dark` (`ui.tsx` L44; login error L81; apply error L105).
- Avatar chips — initials circles `bg-rausch/10 text-rausch-dark` (employees list L102 `h-11 w-11`, record header L167 `h-14 w-14`, topbar suggestions L295 `h-8 w-8`, recruitment candidates L54).
- Active shard chips — `bg-rausch/10 px-3 py-1.5 text-[13px] font-semibold text-rausch-dark` (admin shards L99).

### Babu `#00A699` — success

- **Approve action** — `h-9 rounded-full bg-babu px-4 text-[13px] font-semibold text-white hover:opacity-90` (leave Approve — the only `babu`-filled button in the app; `leave-decision.tsx` L36).
- **Success banners** — `rounded-card border border-babu/30 bg-babu/10 px-4 py-3 text-sm font-medium text-babu` (admin users L92; attendance check-in L118; job-created panel L76 in `text-hof`).
- **Inline success notices** — `text-sm font-medium text-babu` ("Changes saved.", "Invitation sent.", profile/settings notices; ~8 sites).
- **StatusPill ACTIVE** — `bg-babu/10 text-babu` + `bg-babu` dot (the only status that is colored).
- **Progress + pipeline** — batch progress fill `bg-babu`; application pipeline done-segments `bg-babu` vs rest `bg-line-soft` (applications detail L94).
- **Sourcing 200 chips** — `rounded-full bg-babu/10 px-2.5 py-1 text-xs font-semibold text-babu` (sourcing L60); roles matrix "Yes" cells `font-semibold text-babu` (roles L28).
- Dashboard attendance card tile `bg-babu/10 text-babu`.

### Arches `#FC642D` — warning

- **Warning banners** — `rounded-card border border-arches/40 bg-arches/10 px-4 py-2 text-sm font-medium text-hof` (attendance L113, attendance reports L108, reports L45 — "stale/read-only/partial data" notices).
- **Error/status chips** — `rounded-full bg-arches/10 px-2.5 py-1 text-xs font-semibold text-arches` (sourcing error rows L58).
- **Override (leave)** — outline trigger `border border-arches text-arches hover:bg-arches/10` (L45) and confirm submit `bg-arches text-white` (L59), both `h-9 rounded-full text-[13px] font-semibold`.
- Dashboard leave card tile `bg-arches/10 text-arches`.

### Hof `#484848`

- **Default text** — set on `html`; all headings/body via `text-hof`.
- **Dark buttons** — recurring ad-hoc pattern `bg-hof text-white hover:bg-black` (landing "Sign in", jobs "Log in", employees "Find", performance "Manage cycles", audit "Apply", apply-success CTA). Sizes h-10/h-11/h-12.
- **Active tabs & filter chips** — `bg-hof text-white` pills on white (record tabs L188 and following; recruitment stage filters).
- **Avatars (solid)** — people avatars `rounded-full bg-hof text-white` (dashboard preview rows L170 `h-10 w-10`, account menu L146 `h-10 w-10`); the employees directory uses the tinted variant below.
- **Account button** — topbar `bg-hof text-white hover:bg-black` (L146).
- **Tinted tile** — `bg-hof/10 text-hof` (dashboard notifications card only, L144).
- **CTA band** — landing `rounded-card bg-hof text-white` with sub copy `text-white/70`.
- **Code surface** — system-health metrics `<pre className="rounded-input bg-hof ... text-white">` (L70) — the only dark content surface.
- **Scrims** — drawer `bg-hof/30` (shell L233), dialog `bg-hof/30` (attendance L152).
- **Focus ring** — `ring-hof` on buttons, `ring-hof/40` on inputs.

### Foggy `#767676`

- Secondary text everywhere (`text-foggy`): card body copy, list meta lines, subtitles, empty-state body, legal footer.
- Idle nav items and "Log out" — `text-foggy hover:bg-pearl hover:text-hof` (shell L82/L119).
- "Admin" sidebar section label — `px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-foggy` (L106).
- Placeholders — `placeholder:text-foggy/70` (TextInput, login inputs) and `placeholder:text-foggy` (topbar search L278).
- Neutral StatusPill text + dot (`bg-foggy`), standby shard chip, idle filter chips (`bg-pearl text-foggy`).
- Footer links `text-foggy hover:text-hof hover:underline`; topbar search icon `text-foggy`.

### Pearl `#F7F7F7`

- **Quiet button** — `bg-pearl text-hof hover:bg-line-soft` (Button `quiet`).
- **Hover surfaces** — nav items, account-menu items, suggestion rows, list rows (`hover:bg-pearl`), and softer row hover `hover:bg-pearl/60` (dashboard directory rows, notifications rows).
- **Auth floor** — login/forgot/reset/register pages sit on `bg-pearl` (sampled rgb(247,247,247)).
- **Search pill** — `bg-pearl/60` pill in the topbar.
- **Skeletons** — `h-16 animate-pulse rounded-card bg-pearl` blocks.
- **Empty state** — `bg-pearl/60` + dashed `border-line`.
- **Progress track** — `h-2 overflow-hidden rounded-full bg-pearl`.
- Neutral chips — `bg-pearl text-foggy` (standby shard, idle filter chips, neutral StatusPill).

### Line `#DDDDDD`

- Input/select/textarea borders (`border-line`) — TextInput, login inputs, selects, textareas, topbar search pill, outline buttons/tabs.
- Dashed empty-state border.
- Read dot in notifications (`bg-line`).
- Idle tab buttons (record page).

### Line-soft `#EBEBEB`

- Card borders (`Card`), list/table dividers (`divide-line-soft`), dropdown borders.
- Structural hairlines: sidebar `border-r`, topbar `border-b`, footer `border-t`, sidebar logout divider.
- Pipeline rest-segments (`bg-line-soft`).

### White / Black

- `#FFFFFF` — page floor (sampled body bg rgb(255,255,255)), cards, inputs, panels, text on dark/accent fills.
- `#000000` — only `hover:bg-black` on `hof` fills and one `hover:text-black` link. Nothing else.

### `#FFE8E9`

- `::selection` background only.

---

## 3. Translucent (alpha) recipes shipped

Every alpha variant actually present in the compiled CSS; use these names, they are in production class strings:

| Class | Computed value | Where |
|---|---|---|
| `bg-rausch/10` | rgba(255, 90, 95, 0.10) | icon tiles, avatar chips, error-banner fill, danger hover |
| `border-rausch/30` | rgba(255, 90, 95, 0.30) | error-banner border |
| `bg-babu/10` | rgba(0, 166, 153, 0.10) | success fills, ACTIVE pill, chips |
| `border-babu/30` | rgba(0, 166, 153, 0.30) | success-banner border |
| `bg-arches/10` | rgba(252, 100, 45, 0.10) | warning fills, error chips, override hover |
| `border-arches/40` | rgba(252, 100, 45, 0.40) | warning-banner border |
| `bg-hof/10` | rgba(72, 72, 72, 0.10) | dashboard notifications tile |
| `bg-hof/30` | rgba(72, 72, 72, 0.30) | modal & drawer scrim |
| `ring-hof/40` | rgba(72, 72, 72, 0.40) | TextInput focus ring |
| `bg-pearl/60` | rgba(247, 247, 247, 0.60) | search pill, row hover, empty state |
| `bg-white/95` | rgba(255, 255, 255, 0.95) | topbar (with blur) |
| `text-white/70` | rgba(255, 255, 255, 0.70) | sub copy on the dark CTA band |
| `placeholder:text-foggy/70` | rgba(118, 118, 118, 0.70) | TextInput placeholders |

---

## 4. Typography

**Font stack (nothing bundled):**
`"Circular", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`
→ rendered face is the OS UI font (Segoe UI on Windows). The "Airbnb Cereal/Circular" look is declared but never loaded.

Sizes that actually appear (class → px):

| Role | Classes | Size / weight |
|---|---|---|
| Hero H1 (landing) | `text-4xl md:text-6xl font-extrabold tracking-tight` | 36 → 60 / 800 |
| Page H1 (app shell) | `text-2xl md:text-[28px] font-extrabold tracking-tight` | 24 → 28 / 800 |
| CTA band H2 / auth brand | `text-3xl` / `text-2xl` `font-extrabold tracking-tight` | 30 / 800 |
| Card/section titles | `text-lg font-bold` (record) or `font-semibold` (admin) | 18 / 700–600 |
| Metric values | `text-xl font-extrabold` | 20 / 800 |
| Body / nav / primary buttons | `text-[15px]` | 15 / 400 (nav 500, buttons 600) |
| Secondary UI (small buttons, tabs, list titles) | `text-sm` | 14 / 600 |
| Chips & tiny buttons | `text-[13px] font-semibold` | 13 / 600 |
| Meta / captions | `text-xs` | 12 / 400–600 |
| Report bar labels | `text-[11px] font-medium capitalize` | 11 / 500 |
| Logo "H" | `font-black` | 900 |
| IDs, tokens, URLs, log lines, metrics pre | `font-mono text-[13px]` / `text-xs` | 13 / 12 |
| Numeric columns/tables | `tabular-nums` (10 files: reports, performance, admin, attendance reports) | — |

Weights in use: 400, 500, 600, 700, 800, 900. Tracking: `tracking-tight` on headings/wordmarks; `tracking-wide` + `uppercase` on the Admin section label.

---

## 5. Shape, elevation, motion, focus

**Radii**

| Token / class | Value | Used for |
|---|---|---|
| `rounded-full` | 9999px | All buttons, chips, pills, avatars, search pill, progress bars, tabs, icon buttons |
| `rounded-card` | 12px | Cards, dropdown panels, CTA band, hero image, banners, skeletons, 12px logo square, icon tiles |
| `rounded-input` | 8px | Inputs, selects, textareas, nav items, dark metrics `<pre>` |
| `rounded-lg` | 8px | Public-page logo squares (same value, different class) |
| `rounded-md` | 6px | Footer logo square |
| `rounded` | 4px | Checkboxes |
| `rounded-2xl` | 16px | Jobs search dropdown only (outlier) |

**Shadows** (defined in `globals.css`)

| Token | Value | Used for |
|---|---|---|
| `shadow-card` | `0 1px 2px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.05)` | Cards, login card, table panels |
| `shadow-pop` | `0 0 0 1px rgba(0,0,0,.04), 0 8px 28px rgba(0,0,0,.12)` | Dropdowns, hero image, mobile drawer; `hover:shadow-pop` on clickable cards (dashboard ×2, recruitment hub, jobs list) |

**Motion** — minimal: `transition` (150ms default) / `duration-200` on buttons and inputs; `active:scale-[0.98]` on buttons; `animate-pulse` on skeletons; `transition-[width] duration-200` on progress fills; `backdrop-blur` on sticky topbar. No page transitions, no entrance animations, no chart animation. No chart library at all — data viz is numbers plus the progress bars.

**Focus** — inconsistent:

- Buttons (component + most ad-hoc): `focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2`.
- `TextInput`: `focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40`.
- Login/register/jobs inputs: `focus:border-hof` **only** — no ring.

**Accessibility patterns already present (keep them):** `role="tablist"/"tab"` + `aria-selected`, `aria-current="page"` nav, `role="dialog" aria-modal`, `role="alert"` errors, `role="status"` notices, `role="combobox"/"listbox"` search suggestions, `aria-busy` skeletons, labelled icon buttons.

---

## 6. Component inventory (exact recipes)

### Button (`ui.tsx` L4–24) — three variants

Base: `inline-flex h-12 items-center justify-center rounded-full px-6 text-[15px] font-semibold transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-hof focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60`

| Variant | Classes | Look |
|---|---|---|
| `primary` | `bg-rausch text-white hover:bg-rausch-dark` | `#FF5A5F` pill, hover `#E0484D` |
| `quiet` | `bg-pearl text-hof hover:bg-line-soft` | `#F7F7F7` pill, hover `#EBEBEB` |
| `outline` | `border border-line bg-white text-hof hover:border-hof` | white pill, `#DDDDDD` border, hover border `#484848` |

**Ad-hoc button patterns** (hand-rolled per page — same look, no component):

- Dark: `h-10/h-11/h-12 rounded-full bg-hof px-5/6 text-sm/[15px] font-semibold text-white hover:bg-black active:scale-[0.98]`.
- Success: `h-9 rounded-full bg-babu px-4 text-[13px] font-semibold text-white hover:opacity-90`.
- Warning outline + fill: `border border-arches text-arches hover:bg-arches/10` / `bg-arches text-white`.
- Danger outline: `border border-rausch text-rausch-dark hover:bg-rausch/10` (h-11).
- Outline/white: `border border-line bg-white text-hof hover:bg-pearl`.
- Icon circle: `grid h-10 w-10 place-items-center rounded-full border border-line-soft hover:bg-pearl` (bell) / without border (close, hamburger).

Button heights in the wild: **48 / 44 / 40 / 36px** — no size system.

### Card

`rounded-card border border-line-soft bg-white shadow-card` + padding per use (`p-5`, `p-6`, `p-8`). Interactive cards add `transition hover:shadow-pop`.

### Field / TextInput / selects / textarea / checkbox

- `Field`: `grid gap-2 text-sm`, label `font-semibold text-hof`, error `text-sm font-medium text-rausch-dark`.
- `TextInput`: `h-12 rounded-input border border-line bg-white px-4 text-[15px] text-hof outline-none transition duration-200 placeholder:text-foggy/70 focus:border-hof focus-visible:ring-2 focus-visible:ring-hof/40`.
- Selects: same recipe at `h-12` (leave apply) or `h-10` (performance picker) — inconsistent.
- Textarea: same recipe (announcement compose).
- Checkbox: native `h-4 w-4 rounded border-line accent-rausch`.
- Date inputs: native `type="date"` wearing the TextInput recipe. File input: native.

### StatusPill (`ui.tsx` L64–77) — binary semantics

`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold` + `h-1.5 w-1.5` dot.
`ACTIVE` → `bg-babu/10 text-babu` + `#00A699` dot. **Everything else** → `bg-pearl text-foggy` + `#767676` dot. Used for employees (ACTIVE/INACTIVE), admin users (ACTIVE/DEACTIVATED), shards (`OPEN`), system health (`ACTIVE`/`GATED`), application stages (render neutral).

### Chips

- Filter chip: active `bg-hof text-white`, idle `bg-pearl text-foggy hover:text-hof`, `h-9 rounded-full px-4 text-[13px] font-semibold` (recruitment filters L49).
- Status chip: `bg-{tone}/10 text-{tone}` (babu 200s, arches errors, rausch/rausch-dark actives) or `bg-pearl text-foggy` (neutral).
- Dot: `h-2 w-2 rounded-full` — `bg-rausch` unread / `bg-line` read.

### Avatars

- People (solid): `rounded-full bg-hof text-white font-bold` — h-10 (40px) dashboard/account.
- Tinted: `rounded-full bg-rausch/10 text-rausch-dark font-extrabold` — h-8 (32px) suggestions, h-11 (44px) directory, h-14 (56px) record header.

### Notices / banners

- Success: `rounded-card border border-babu/30 bg-babu/10 px-4 py-3 text-sm font-medium text-babu` (borderless inline variant too).
- Warning: `rounded-card border border-arches/40 bg-arches/10 px-4 py-2 text-sm font-medium text-hof`.
- Error: `rounded-card border border-rausch/30 bg-rausch/10 px-4 py-3 text-sm font-medium text-rausch-dark`.
- Inline notices: single line `text-sm font-medium` in `text-babu` / `text-rausch-dark` / `text-foggy`.
- There is no toast system — feedback is always inline text or banners.

### Progress & pipeline

- Bar: track `h-2 overflow-hidden rounded-full bg-pearl`; fill `h-full rounded-full` `bg-babu` (batch run) or `bg-rausch` (performance completion, reports).
- Pipeline (application detail): six segments (`APPLIED → SCREENING → SHORTLISTED → ASSESSMENT → INTERVIEW → SELECTED`), `h-1.5 flex-1 rounded-full`, done `bg-babu`, remaining `bg-line-soft`.

### Lists & tables

- Lists live inside `Card`s with `divide-y divide-line-soft` rows; clickable rows `hover:bg-pearl/60`.
- Tables: `w-full min-w-[760px] border-collapse text-sm` (roles L73); numeric cells `tabular-nums`; id/log columns `font-mono text-[13px]`.

### Tabs

Pill tabs, no underline pattern: active `inline-flex h-10 items-center rounded-full bg-hof px-5 text-sm font-semibold text-white`; idle `border border-line bg-white text-hof hover:bg-pearl` (record page L186–192).

### Overlays

- Dropdown/menu panel: `rounded-card border border-line-soft bg-white shadow-pop` (account menu `w-48 py-1`, items `px-4 py-2.5 text-sm font-medium text-hof hover:bg-pearl`).
- Mobile drawer: scrim `bg-hof/30`, panel `w-72 bg-white shadow-pop`, close `h-9 w-9 rounded-full hover:bg-pearl`.
- Dialog: `fixed inset-0 z-50 grid place-items-center bg-hof/30 p-4` + Card panel (attendance correction).

### Icons & imagery

- `@phosphor-icons/react` only, no custom SVGs. Sizes 16/18/20/22/24; `weight="regular"` idle vs `weight="fill"` active/feature. Nav icons 20.
- Photography: one external Unsplash image on the landing hero (`rounded-card shadow-pop`). Everything else is initials + icons. No illustrations, no product screenshots.

---

## 7. Surface-by-surface map

| Surface | What it looks like today |
|---|---|
| **Landing `/`** | White floor; sticky `bg-white/95` blurred header, `border-line-soft`; rausch wordmark + 8px logo; hero 60px/800 `#484848`; secondary CTA = hof outline pill hover pearl; rausch primary CTA; Unsplash hero with `shadow-pop`; feature cards with `bg-rausch/10` tiles; `bg-hof` CTA band radius 12; footer hairline + foggy links |
| **Auth (login, forgot, reset, register)** | Pearl `#F7F7F7` floor; centered white card 12px + `shadow-card`; rausch logo row; h-12 inputs `#DDDDDD` border, focus border `#484848` (no ring); rausch submit; `text-rausch-dark` errors/links |
| **App shell** | 240px white sidebar with `#EBEBEB` right hairline (transparent over white — no distinct sidebar tone); nav 36px rows radius 8, idle `#767676`, hover `#F7F7F7`, active `#F7F7F7` + `#484848` semibold + filled icon; 64px topbar `rgba(255,255,255,.95)` + blur, `#EBEBEB` bottom hairline; `bg-pearl/60` search pill; content `max-w-7xl` on white; page H1 28px/800 `#484848` |
| **Dashboard** | Four metric cards with 48px tiles: babu (`bg-babu/10`), arches, rausch, `bg-hof/10`; person avatars solid hof; rows `hover:bg-pearl/60`; signed-out CTA rausch h-11 |
| **Employees directory + record** | Search row with dark `Find` button (`bg-hof hover:bg-black`); tinted rausch avatars in list; record header avatar 56px tinted; StatusPill (ACTIVE colored, else neutral); pill tabs active `#484848`; edit card; salary card; danger zone = rausch outline deactivate |
| **Attendance** | Month list with plain-text statuses (PRESENT/LATE not color-coded); check-in success banner babu; correction dialog on `bg-hof/30` scrim; drift warning banner arches |
| **Leave** | Statuses plain text; `bg-babu` Approve / outline Reject / arches Override with `[13px]` small buttons; balance table |
| **Payroll** | Dark/rausch run action; `#F7F7F7` progress track + babu fill; batch rows; negative nets render as plain text (no red) |
| **Performance** | Rausch completion bar on pearl; dark "Manage cycles"; cycles table `tabular-nums`; star ratings as plain "5★ 0 · …" text |
| **Recruitment** | Pipeline done-segments babu; arches error chips; babu 200 chips; active stage filter `bg-hof`; created-job short link in `font-mono` |
| **Reports** | Rausch bars on pearl; arches warning banner; `tabular-nums` tables |
| **Notifications** | Unread dot `#FF5A5F` / read `#DDDDDD`; rows `hover:bg-pearl/60`; success notice `bg-babu/10 text-babu`; dashboard count tile `bg-hof/10` |
| **Admin** | Dark filter buttons; StatusPills; rausch-dark active chips vs pearl standby; dark `<pre>` metrics block (`bg-hof`, mono, white); ids in `font-mono`; roles matrix "Yes" in babu |
| **Public jobs `/jobs`, `/jobs/[slug]`, apply, status** | 8px rausch logo square + rausch wordmark; rausch "Apply" h-12; hof dark buttons hover black; apply success shows status token in `bg-pearl` mono box; application-status renders the stage through the (neutral) StatusPill |
| **Portal `:4100`** | Programmer-art HTML, no styles — fixture only |

---

## 8. Live-rendered verification (sampled, Chrome @ `localhost:3000`)

| Element | Rendered value |
|---|---|
| `html`/`body` | bg `rgb(255,255,255)` = `#FFFFFF`, color `rgb(72,72,72)` = `#484848`, font stack as declared (falls back to OS face) |
| Sidebar (`aside`) | background transparent (page white), right border `rgb(235,235,235)` = `#EBEBEB`, width 240px; nav row 36px |
| Topbar (`header`) | `rgba(255,255,255,0.95)` + backdrop blur, height 64px, bottom border `#EBEBEB` |
| Page H1 | 28px / weight 800 / `#484848` |
| Login floor / card | `rgb(247,247,247)` = `#F7F7F7` / white card, radius 12px, border `#EBEBEB` |
| Login input | white, border `#DDDDDD`, radius 8px, height 48px, 15px text |
| Login primary button | `rgb(255,90,95)` = `#FF5A5F`, white 15px/600 text, full radius, height 48px; hover `rgb(224,72,77)` = `#E0484D` |
| Landing hero H1 | 60px / 800 / `#484848` |
| Landing CTA band | `#484848`, radius 12px |
| Landing dark button | `#484848`, white 14px/600, full radius, 40px; hover `#000000` |
| Footer edge | `#EBEBEB` top hairline |
| Record tabs | active fill `#484848` + white; idle white + `#DDDDDD` border, hover `#F7F7F7` |

Cross-checked against the compiled Tailwind v4 output — the utility list matches the palette above exactly (no undocumented colors in the bundle).

---

## 9. Gaps & quirks (candidate work for the premium pass)

1. **Thin color semantics.** Only `ACTIVE` gets color (`babu`). LATE/ABSENT/REJECTED/PENDING_*/DEACTIVATED/stages all render neutral pearl-grey. Status color carries almost no meaning today.
2. **No size/variant system for buttons.** Three official variants + at least six hand-rolled patterns across ~50 files; four button heights (48/44/40/36) with no rule.
3. **Focus inconsistency.** Ring on component buttons, border+ring on `TextInput`, border-only on auth/jobs inputs.
4. **No webfont.** `Circular` is declared but never shipped → OS font renders; the intended Cereal-style voice (docs/design-system.md) never actually appears.
5. **Ad-hoc type scale.** `[11px]/[13px]/[15px]/[28px]` mixed with Tailwind steps; body size 15px bypasses the scale.
6. **Radius drift.** Same visual values via different classes (`rounded-card` 12 vs `rounded-lg` 8 for logo squares; `rounded-input` 8 vs `rounded-lg` 8); one `rounded-2xl` (16px) outlier.
7. **Black sneak-ins.** `hover:bg-black` on `hof` fills and `hover:text-black` — the only `#000000` in the UI.
8. **Flat elevation.** Two shadows total; rows/tables/sidebar have no elevation language.
9. **Sidebar has no identity.** White on white with a single hairline; active state is a light grey pill.
10. **No semantic token layer.** Success/warning/error = raw palette color + per-usage alpha class strings; nothing named `--color-success` etc. Theme changes require touching every class string.
11. **No dark mode, no theming hooks.** Single light theme; alpha recipes hardcoded per site.
12. **Feedback patterns limited.** No toasts, no global error boundary UI; every page re-implements banners/notices.
13. **Candidate portal** is unstyled fixture HTML — out of scope for visual language, but it is user-visible during demos at `:4100`.

---

*Audit commands to re-verify:* token source `apps/web/app/globals.css`; utility census via the compiled file in `apps/web/.next/static/css/`; rendered values via `browser_evaluate` computed styles on `:3000`. Findings are descriptive only — no code was changed by this audit.
