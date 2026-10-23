# Velura vs HRMS — design system comparison & recommendation

> **Status:** Decision input for the premium-SaaS revamp. No code changed, no commits made (per instruction).
>
> **Branch / base:** `ui-tweaks` @ `6f4509b` (synced with `origin/ui-tweaks`).
>
> **Inputs:**
> 1. [`docs/Velura-Design.md`](Velura-Design.md) — 834-line extraction of VeluraHQ from source + live rendering.
> 2. [`docs/current-design.md`](../ui/current-design.md) — 383-line factual inventory of HRMS as-is, source + live rendering.
> 3. [`docs/design-system.md`](../architecture/design-system.md) — HRMS's current canonical doc (37 lines, explicitly "Airbnb language").
> 4. Skills applied: `redesign-existing-projects`, `design-taste-frontend`, `high-end-visual-design`.
>
> **Method:** evidence-only comparison (tokens, geometry, type, component recipes, live values), then a weighted scorecard. Scores are judgments, not measurements; weights reflect an HR/payroll product, not a marketing site.

---

## 0. Design read (required by `design-taste-frontend`)

**Reading this as:** an internal **B2B HR / payroll product** for HR administrators, managers and employees, with a **trust-first, calm, premium** language, leaning toward **Velura's emerald/slate operational system translated into HRMS's existing Next.js + Tailwind v4 stack** — not the current Airbnb-marketplace language.

Dial settings for this product (overriding the skill's landing-page defaults):

| Dial | Product (app) | Marketing / auth |
|---|---|---|
| `DESIGN_VARIANCE` | **3** (predictable, scannable) | **6** (offset, not chaotic) |
| `MOTION_INTENSITY` | **3** (state feedback only) | **5** (entrance + hover, reduced-motion gated) |
| `VISUAL_DENSITY` | **7** (operational, not cockpit) | **4** (room to breathe) |

The two landing-page skills explicitly do not govern the app. `design-taste-frontend` says in its own header: *"Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI."* `high-end-visual-design` targets agency/portfolio experiences and mandates double-bezel cards, floating pill nav and `py-24+` sections — all hostile to a 10-module HRMS. Their **quality bar** applies everywhere; their **layout mandates** do not. Details in §7.

---

## 1. Verdict

**Velura's design system is the better foundation for HRMS — by a wide margin — but it should be translated, not transplanted.**

| Option | Weighted score | One-line read |
|---|---:|---|
| HRMS as-is (Airbnb language) | **43.3 / 100** | Friendly consumer marketplace; thin semantics; inconsistent components |
| Velura as-is (verbatim) | **72.3 / 100** | Calm, dense, coherent; carries Velura's own drift and brand |
| **Velura translated for HRMS (recommended)** | **78.4 / 100** | Velura's structure + HRMS brand layer + fixes for Velura's known drift |

**What that means in practice:**

1. **Adopt** Velura's foundations (emerald/slate, DM Sans, 8px geometry, green-tinted hairlines), its primitive recipes, its app-shell proportions, its status dictionary, and its one-page composition recipe.
2. **Keep** HRMS's Phosphor icons, its existing ARIA patterns, its label-above-input form pattern, its `tabular-nums` discipline, and the coral brand mark at the **brand/marketing layer**.
3. **Drop** rausch as the product's primary action color, pill-everything buttons, 12px cards, `shadow-pop`, the OS font, four button heights, and the "only ACTIVE is colored" status model.
4. **Do not copy** Velura's duplicate status/KPI systems, token bypass, arbitrary radii, dead effect graveyard, or its no-dark-mode debt. Fix those once, in HRMS's `@theme`.
5. **Do not let the two landing-page skills loose on the app.** Their consensus fixes (font, one accent, tinted shadows, complete states, focus rings) are the revamp's non-negotiables; their `VARIANCE 8`, double-bezel and `py-24` mandates are not.

**The core argument:** HRMS's current system is an Airbnb marketplace pastiche applied to payroll, leave and attendance. Velura's system was built for exactly the kind of dense operational surface HRMS is: sidebar + table + status + KPI + report. Velura's geometry is quieter, its typography is stronger, and its semantics are richer. That is the premium-SaaS direction the revamp needs.

---

## 2. Side-by-side

| Dimension | HRMS today | Velura | Edge |
|---|---|---|---|
| **Aesthetic origin** | Airbnb language: coral accent, pill buttons, 12px cards, friendly | Emerald-on-slate Linear/Stripe-adjacent: quiet hairlines, 8px geometry | **Velura** |
| **Palette** | 9 named tokens: rausch `#FF5A5F`, rausch-dark `#E0484D`, babu `#00A699`, arches `#FC642D`, hof `#484848`, foggy `#767676`, pearl `#F7F7F7`, line `#DDD`, line-soft `#EBEBEB` | Token layer (`#F8FAFC` bg, `#0F1729` ink, `#637288` muted, `#E1E7EF` border, `#129174` primary) + hard-coded emerald/slate ladder | **Velura** |
| **Primary action** | Coral `#FF5A5F` pill; white 15px/600 text (**3.05:1 — fails AA**) | Emerald-700 `#047857` in shipped CTAs; white text (**5.48:1 — passes**) | **Velura** |
| **Typography** | No webfont; OS UI face. Six weights. 15px body, 28px/800 H1, extrabold everywhere | DM Sans variable 100–1000. 400 display / 600 support. 16px body, 25px/600 H1, 68px/400 marketing H1 | **Velura** |
| **Shape** | Buttons/chips always pill; cards 12px; inputs 8px; one 16px outlier | 6px controls, 8px cards/panels; pills only for badges; flattened scale | **Velura** |
| **Elevation** | Two generic black-alpha shadows (`shadow-card`, `shadow-pop`) | Hairline + green-tinted soft shadows; heavy elevation only on auth | **Velura** |
| **Density** | 64px topbar, white-on-white 240px sidebar, 48px inputs, airy rows | 56px header, 240px sidebar, 36px nav rows, 50px table rows, 20–24px gaps | **Velura** |
| **Buttons** | 3 official variants + 6 hand-rolled patterns; 48/44/40/36px heights | CVA variants + sizes; one height language | **Velura** |
| **Status semantics** | Only `ACTIVE` is colored. LATE / ABSENT / REJECTED / PENDING all grey | 5-tone dictionary (success/warning/danger/info/neutral) | **Velura** |
| **Data display** | Numbers + progress bars; no chart library; no page transitions | Hand-built bars/SVG; KPI cards, deltas, 1.45/0.55 dashboard split | **Velura** |
| **App shell** | 240px white-on-white sidebar (no identity), 64px topbar, `max-w-7xl` | 240px sidebar with active language, 56px header, 1700px container, emerald wash | **Velura** |
| **Page composition** | Every page bespoke | One recipe: PageHeader → KPI grid → content grid → Card/Table | **Velura** |
| **Auth** | Pearl floor + white card; clean but generic | Gradient world + dark panel + glass card; distinctive | **Velura** |
| **Motion** | Minimal transitions + `active:scale`; no entrance | CSS reveals (0/60/120ms), house easing, reduced-motion handling | **Velura** |
| **Theming** | No semantic layer; alpha recipes per site; light only | Nominal token layer but hard-coded surfaces; light only | **Tie (both weak)** |
| **Accessibility** | Good ARIA coverage; focus gaps; primary contrast fails | Decent primitives; focus gaps; table `aria-sort` missing; token contrast fails | **Tie (both need work)** |
| **Implementation fit** | Already Tailwind v4 `@theme` + components | Tailwind v3 + shadcn; needs translation | **HRMS** |
| **Brand distinctiveness** | Coral is memorable but reads Airbnb | Coherent, but emerald is a crowded SaaS signal | **Tie / contextual** |
| **Written doctrine** | 37-line token doc; Airbnb parity is the goal | Explicit anti-slop, dense-operational doctrine | **Velura** |

---

## 3. Why Velura wins for an HRMS

### 3.1 Domain fit: payroll is trust, not marketplace

HRMS handles salaries, leave, attendance, payroll batches, contracts and personal data. The visual language should signal **accuracy, calm and control**. HRMS's current coral (`#FF5A5F`) is the Airbnb marketplace accent; it is bright, consumer-facing, and sits semantically close to its own error color (`rausch-dark`) and warning color (`arches #FC642D`). In a payroll product, a red-primary button competing with red errors is a real usability cost, not just a taste issue.

Velura's emerald/slate system reads as finance/operations software: white surfaces, slate text, a single green action, amber/rose only for exceptions. That is the correct temperature for HR.

### 3.2 Typography is the single biggest upgrade

`redesign-existing-projects` puts the font swap first in its fix priority, and HRMS has the largest possible gap here: **no webfont is shipped at all**. `Circular` is declared but never loaded, so the product renders in Segoe UI / Roboto. Six weights (400–900) are in use, with `font-extrabold` on page titles and metrics. Body text is 15px, headings are 28px/800.

Velura ships **DM Sans variable** via `next/font`, a coherent scale (14/16/17/19/25/31/37/49/61/73px), 400-weight display type with tight tracking, 600-weight support text, and 11px letterspaced labels. The result is quieter and more expensive-looking at the same time. This is the highest-leverage, lowest-risk change in the entire revamp.

### 3.3 Geometry: restraint reads premium

HRMS's rules are internally consistent but consumer-shaped: **every button, chip, tab and avatar is a full pill**, cards are 12px, inputs 8px, with a 16px outlier. Velura flattens the scale (6px controls, 8px cards, pills only for status), which is the geometry of operational software. The difference is subtle in a screenshot and obvious in use: less "app marketplace", more "system of record".

### 3.4 Component consistency

HRMS has three official Button variants plus **at least six hand-rolled patterns** (dark, success, warning outline, warning fill, danger outline, icon circle) and **four heights** (48/44/40/36). The same visual button exists in five places with different code. Velura has a CVA button with variants and sizes, one Field/TextInput, one Card, one StatusPill (nominally), one DataTable. Porting that discipline removes a whole class of drift.

### 3.5 Status semantics are a functional gap

In HRMS, `StatusPill` is binary: `ACTIVE` gets babu teal; **everything else is grey** — LATE, ABSENT, REJECTED, PENDING_APPROVAL, DEACTIVATED, every recruitment stage. A leave manager scanning a list cannot see what needs attention. This is the strongest evidence that the current system is under-designed for the domain.

Velura's five-tone dictionary (success / warning / danger / info / neutral) plus tinted pills and dots is directly reusable. The port needs a proper HR status map (§8.3), but the model already exists.

### 3.6 One page recipe scales; bespoke pages do not

Velura's app pages follow a consistent recipe: `PageContainer` (1700px) → `PageHeader` (eyebrow, 36px icon tile, 25px title, description, actions) → 4-up KPI grid at `gap-5` → content grid (`xl:grid-cols-[1.45fr_0.55fr]`) → Card → toolbar → DataTable. It is visible on the dashboard, keywords, AI Search and prompts.

HRMS has ~15 surfaces, each with its own header, filter row, card and table markup. Every new page re-invents spacing and action placement. A single recipe is the scalability win.

### 3.7 Velura wrote its doctrine down

Velura's `docs/product-context.md` explicitly bans "generic AI-generated slop", decorative filler, vague glassmorphism, oversized empty cards, random gradients, hero-scale type inside app screens, decorative orbs and nested cards, and calls for "dense, operational workspace UI". HRMS's 37-line design doc encodes "Airbnb language" and "3-card rhythm" instead. The revamp needs a **new canonical doc**, not just new classes.

---

## 4. Where HRMS is already better (keep it)

1. **Phosphor icons.** HRMS uses `@phosphor-icons/react` only, with regular/fill weights. The design skills explicitly allow/encourage Phosphor and discourage Lucide. Velura uses Lucide. Do **not** switch icon families during the revamp.
2. **Accessibility patterns.** HRMS already ships `role="tablist"/"tab"` + `aria-selected`, `aria-current="page"`, `role="dialog" aria-modal`, `role="alert"`, `role="status"`, `role="combobox"/"listbox"`, `aria-busy` skeletons and labelled icon buttons. Velura has focus gaps and an unroled combobox. Keep HRMS's ARIA work and extend it.
3. **Form pattern.** Label above input, error below, no placeholder-as-label. That matches both skills and Velura. Keep it.
4. **`tabular-nums`.** Already used in 10 files (reports, performance, admin, attendance). Extend it to every numeric table and KPI; Velura uses it too.
5. **Restrained motion.** No scroll hijack, no marquees, no shader layers. This is cheap to keep and easy to upgrade with intentional reveals. Velura's marketing effects are irrelevant to HRMS.
6. **Smaller surface area / less dead code.** HRMS has one UI file and one shell file. Velura carries a 10+ component effect graveyard and duplicate hero implementations. Do not import that entropy.
7. **Implementation fit.** HRMS is already on Next.js + Tailwind v4 `@theme` with a component file. The revamp is a translation, not a migration.

---

## 5. Where Velura is weak (do not copy)

| Weakness | Evidence | Port rule |
|---|---|---|
| **Two status systems** | `ui/status-pill.tsx` vs `components/status-badge.tsx`; `queued` slate vs sky, `running` amber vs violet | Build **one** `StatusPill` with the HR map |
| **Two KPI cards** | StatCard 25px value / muted label / 40px tile vs MetricCard 28px / slate-400 / 36px / built-in trend | Build **one** `MetricCard` |
| **Token bypass** | `--primary #129174` used only by Button `default`; shipped CTAs hard-code `#047857` / `#10B981` | Pick one primary and use it everywhere |
| **Token contrast** | `#129174` on white = **3.94:1**, fails AA for normal text | Use emerald-700 `#047857` for filled actions/text |
| **Radius leaks** | `[22px]`, `[2rem]`, pills compensate for the flattened scale | Document 6/8/full and enforce it |
| **Border drift** | `slate-200/70`, `slate-200`, `emerald-100`, `border-border` | Pick two: structural + interactive |
| **No dark mode** | Zero `dark:` utilities, no `.dark` block, `bg-white` hard-coded across Sheet/GridCard/Bento | Decide light-only for phase 1; build semantic tokens anyway |
| **A11y gaps** | No focus ring on sidebar/Tabs/mobile trigger; no `aria-sort`; combobox lacks `aria-activedescendant` | Fix during the port; do not inherit |
| **Dead code / effects** | 10+ unused effect components, duplicate `LightRays`, blog graveyard, `questly` rebrand residue | Ignore all of it |
| **Micro-label size** | 10–11px uppercase at 0.16–0.22em is used everywhere | Keep eyebrows, but statuses at 11–12px sentence case; 10px is too small for operational scanning |
| **Airy density** | 50px rows, 20–24px gaps despite a "compact" doctrine | Go 44–48px rows, 16–20px gaps in HRMS |
| **Marketing effects** | Shaders, GSAP, marquees, glows | Zero product value for HRMS; skip entirely |

**Important:** Velura's shipped CTA (`#047857`) is better than its own token (`#129174`). If we translate the system, use the shipped value, not the token value. That single choice fixes AA contrast for primary actions.

---

## 6. Weighted scorecard

Rubric: **1–3** broken/absent, **4–5** ad hoc but present, **6–7** coherent, **8–9** systemized, **10** best-in-class. Weights reflect an internal HR/payroll product.

| Criterion | Weight | HRMS as-is | Velura as-is | Velura translated | Why |
|---|---:|---:|---:|---:|---|
| Domain fit (trust, HR/payroll) | 15% | 5 | 8 | 8 | Coral/consumer vs emerald/operational |
| Semantic system (status, tones) | 12% | 3 | 7 | 8 | Binary vs 5-tone; translated map fixes drift |
| Component consistency | 12% | 3 | 8 | 8 | 3+6 button patterns vs one CVA system |
| Typography | 10% | 3 | 9 | 9 | OS font/six weights vs DM Sans/three weights |
| App shell & navigation | 10% | 5 | 8 | 8 | White-on-white sidebar vs active language |
| Data display (tables/KPI/charts) | 10% | 4 | 7 | 8 | Progress bars only vs KPI/delta/chart recipes |
| Accessibility | 8% | 5 | 5 | 7 | Both have focus/aria gaps; translation fixes them |
| Brand distinctiveness | 5% | 4 | 7 | 8 | Airbnb echo vs coherent; coral brand layer retained |
| Theming / future-proofing | 8% | 2 | 6 | 7 | No semantic layer vs nominal tokens; both light-only |
| Implementation fit | 10% | 9 | 6 | 7 | Already v4 vs v3 translation |
| **Weighted total** | **100%** | **43.3** | **72.3** | **78.4** | |

**Sensitivity check:**

- If brand continuity is worthless, the translated score collapses toward Velura verbatim (72–75); the decision is the same.
- If phase 1 must include dark mode, subtract ~3 points from Velura/translated (neither has a working dark theme) and add ~2 weeks.
- If accessibility is a hard gate (it should be), both as-is systems fail; the translated target is the only column that reaches 7.
- The weights are the judgment call. Even if typography and brand weights are halved, Velura still wins by >20 points.

---

## 7. What each skill actually says for HRMS

### 7.1 `redesign-existing-projects` — the primary process skill

**Scope:** any existing project; explicitly says work with the current stack, do not migrate frameworks, fix in priority order.

**Applies to:** the entire revamp.

**Adopt:**
- **Fix order:** font swap → palette cleanup → hover/active states → layout/spacing → generic components → loading/empty/error → final type/spacing polish.
- **Font:** a face with character; its suggested pool (Geist, Outfit, Cabinet Grotesk, Satoshi) is compatible with DM Sans. Bundle via `next/font`.
- **Palette:** one accent, desaturated enough to blend; no warm/cool gray mixing; tinted shadows.
- **States:** hover, active, focus-visible, loading skeletons, composed empty states, inline errors; no `window.alert`.
- **Layout:** max-width container, CSS Grid over flex math, `min-h-[100dvh]` not `h-screen` for heroes.
- **Component hygiene:** semantic HTML, no dead code, no arbitrary z-index, real alt text, branded 404, skip link.

**Local overrides (justified):**
- "Dashboard always has a left sidebar" is a critique, not a ban. HRMS has 10+ modules and an established 240px sidebar; keep it. A command palette can supplement it later.
- "Generic card look (border + shadow + white)" — for HRMS tables, prefer **dividers and whitespace** over wrapping every section in a card. Velura itself over-cards. Use cards for KPI groups and genuinely elevated panels, not for every list.
- Do not apply "3-card feature row" replacements to the product app; that rule is for marketing.

### 7.2 `design-taste-frontend` — marketing/auth only

**Scope (verbatim):** *"Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI."*

**Applies to:** landing `/`, public jobs pages, auth, onboarding, empty/brand moments.

**Adopt:**
- One accent color, locked across the page; no random section-level color shifts.
- No pure `#000`; tinted shadows; restrained gradients.
- Hero discipline: ≤2 headline lines, ≤20-word subtext, CTA above the fold, top padding ≤`pt-24`.
- **Eyebrow restraint:** max one eyebrow per three sections. HRMS's landing can drop most of them.
- No generic three-equal-card feature row; vary layout families.
- Real product imagery, not div-based fake screenshots; no stock "diverse team" hero.
- Motion must be motivated; honor `prefers-reduced-motion`; animate only transform/opacity.
- Contrast checks for buttons, forms, placeholders and focus rings.
- No duplicate CTA intent; one label per intent.

**Do not apply to the product:** `VARIANCE 8`, oversized display type, bento-heavy layouts, "every section a different family" (app pages need consistency), mandatory dark mode (internal B2B, phase 1 light-only is acceptable).

**Current landing violations to fix:** 60px/800 hero, three equal feature cards, generic Unsplash hero, and `text-rausch` used both as brand and action color with no semantic separation.

### 7.3 `high-end-visual-design` — brand/auth moments only

**Scope:** agency/portfolio-grade experiences; mandates double-bezel cards, floating pill nav, `py-24+` sections, massive display type, "no 1px gray borders", and entrance animation on everything.

**Applies to:** landing hero, auth, maybe the marketing CTA band. **Not** the app.

**Adopt (quality bar):**
- Haptic press feedback (`active:scale-[0.98]`), custom cubic-bezier, no linear transitions.
- Tinted shadows, no harsh black drop shadows, no pure black.
- One accent; large type only where it is the message.
- Focus-visible rings, reduced-motion, transform/opacity-only animation.
- `tabular-nums` for data; don't use proportional figures in tables.

**Reject for product (explicitly):**
- **Double-bezel/nested cards** — violates Velura's own doctrine ("no nested cards") and adds visual noise to dense screens.
- **Floating pill nav** — HRMS needs a stable 240px sidebar for 10+ modules.
- **`py-24+` sections / oversized display** — would destroy scanability and above-the-fold data density.
- **All-pill CTAs** — HRMS's current pill-everything is already a consumer tell; Velura's 6px buttons are better for operations.
- **"Elements never appear statically"** — in a data app, entrance animation on every row is hostile. Use one 120–200ms fade-up on page blocks, nothing per row.

### 7.4 Cross-skill consensus (the revamp's non-negotiables)

All three agree on:

1. **Bundle a real font** (variable, `next/font`, `display: swap`), with a restrained weight set.
2. **One accent**, used consistently; no purple/AI-gradient default; no pure black.
3. **Tinted shadows** and deliberate elevation, not generic black-alpha drops.
4. **Complete interactive states:** hover, active, focus-visible, loading, empty, error.
5. **Motion with intent:** transform/opacity, 200–300ms, custom easing, reduced-motion gated.
6. **Tabular numerals** in data views; WCAG AA contrast for text and controls.
7. **No decorative filler or nested-card noise** in the product.
8. **A max-width container and a documented spacing/radius system.**

That list is the acceptance filter for every screen in the revamp.

---

## 8. Recommendation

### 8.1 Decision

**Adopt Velura's design system as HRMS's target product system, translated into Tailwind v4 `@theme`; retain HRMS's brand mark and Phosphor icon set; fix Velura's known inconsistencies during the port.**

Concretely:

- **Structure:** Velura.
- **Skin:** HRMS brand layer (coral retained for the logo and marketing accents; emerald for product actions).
- **Iconography:** HRMS Phosphor (not Velura Lucide).
- **Typography:** DM Sans variable as the default translation. If a more distinct HRMS voice is wanted, Satoshi or Geist are acceptable substitutes for the same scale.
- **Scope:** product app first; marketing/auth second; no effect/shader work.

### 8.2 Token translation (exact values to adopt)

| Role | HRMS today | Adopt | Notes |
|---|---|---|---|
| Page background | `#FFFFFF` | `#F8FAFC` | Slate-50; cards then read as surfaces |
| Card / input | `#FFFFFF` | `#FFFFFF` | Keep |
| Ink | `#484848` | `#0F1729` | Near-slate-900; stronger hierarchy |
| Secondary ink | `#767676` | `#637288` | ≈slate-500; passes AA on white |
| Muted / placeholder | `#767676` | `#94A3B8` | Placeholder only; never body |
| Border | `#DDDDDD` / `#EBEBEB` | `#E1E7EF` / `#F1F5F9` | Structural / soft |
| Primary action | `#FF5A5F` | **`#047857`** | Emerald-700; **5.48:1 with white** |
| Primary hover | `#E0484D` | `#065F46` | Emerald-800 |
| Primary soft | `#FFE8E9` | `#ECFDF5` | Emerald-50 |
| Accent highlight | `#00A699` | `#10B981` | Emerald-500; use `#022C22` text on it |
| Success | `#00A699` | `#047857` | Text on emerald-50 |
| Warning | `#FC642D` | `#B45309` | Amber-700 text on amber-50 |
| Danger | `#E0484D` / `#FF5A5F` | `#BE123C` | Rose-700 text on rose-50 |
| Info | — | `#0369A1` | Sky-700 text on sky-50 |
| Brand coral | `#FF5A5F` | `#FF5A5F` | **Logo + marketing only**, not product primary |

**Why emerald-700 and not Velura's `#129174`:** `#129174` on white is 3.94:1 and fails AA for normal text; `#047857` is 5.48:1 and is what Velura actually ships on its CTAs. This is a case where the shipped value is better than the token.

**Typography:**

| Role | Adopt |
|---|---|
| Family | DM Sans variable via `next/font`; fallback `system-ui` |
| Weights | 400 / 500 / 600 (700 only for the logo/wordmark) |
| Body | 16px / 1.6 |
| Secondary | 14px / 1.5 |
| Micro / meta | 12px; eyebrows 11px uppercase at 0.16em |
| Card title | 19px / 600 |
| Page H1 | 25px / 600 / −0.02em |
| Section H2 | 31px / 600 |
| Marketing H2 | 44px / 600 |
| Marketing H1 | 61–68px / **400** / −0.03em |

**Shape, shadow, focus:**

| Token | Value |
|---|---|
| Control radius | 6px (buttons, inputs, selects) |
| Card / panel radius | 8px |
| Pills | `rounded-full`, **status/badges only** |
| Card shadow | `0 1px 2px rgba(6,78,59,.04), 0 8px 24px rgba(6,78,59,.06)` |
| Popover shadow | `0 16px 40px rgba(15,23,42,.12), 0 0 0 1px rgba(15,23,42,.03)` |
| Focus | `ring-2 ring-emerald-500/40` + `border-emerald-300`; never removed |

**Shell, type and density:**

| Item | Adopt |
|---|---|
| Sidebar | 240px; white; right hairline `#E1E7EF`; 36px rows; 13px labels; active `emerald-50` + `emerald-700` + 3×16px indicator |
| Topbar | 56px (from 64); `bg-white/85` + blur; bottom hairline |
| Main | radial emerald wash `rgba(16,185,129,0.04)` at top; padding 16/20/24px |
| Container | `max-w-[1700px]` (from `max-w-7xl` = 1280) |
| Table rows | 44–48px (denser than Velura's 50) |
| KPI grid | 4-up, `gap-5` |
| Content split | `xl:grid-cols-[1.45fr_0.55fr]` for dashboards |
| Button heights | 32 (sm) / 36 (md) / 40 (lg) / 36 (icon) — one system |

### 8.3 HR status map (single `StatusPill`)

| Tone | Fill / text | Statuses |
|---|---|---|
| **Success** | `emerald-50` / `emerald-700`, emerald dot | ACTIVE, APPROVED, PRESENT, COMPLETED, SELECTED, OPEN (job), HEALTHY |
| **Warning** | `amber-50` / `amber-700`, amber dot | PENDING, PENDING_APPROVAL, LATE, HALF_DAY, PROCESSING, GATED |
| **Danger** | `rose-50` / `rose-700`, rose dot | REJECTED, ABSENT, FAILED, DEACTIVATED, OVERDUE |
| **Info** | `sky-50` / `sky-700`, sky dot | ON_LEAVE, HOLIDAY, INTERVIEW, SCREENING |
| **Neutral** | `slate-100` / `slate-600`, slate dot | INACTIVE, DRAFT, CLOSED, CANCELLED, SHORTLISTED, ASSESSMENT, APPLIED |

Rules: **one** component; 11–12px sentence case (not 10px uppercase); a dot plus text, never color alone; `aria-label` includes the status; no silent fallback to grey for unknown values (log a dev warning).

### 8.4 What to keep from HRMS

- `@phosphor-icons/react`; regular idle / fill active; consistent 1.5–2px stroke.
- Existing ARIA: tabs, current-page nav, dialog, alert, status, combobox, busy skeletons.
- Label-above-input; error-below; `Field` wrapper.
- `tabular-nums` on every numeric table, KPI and report.
- 240px sidebar and the current information architecture.
- The coral mark and wordmark on the logo, marketing header and public jobs pages.
- Light-only for phase 1 (but build semantic tokens so dark mode is possible later).

### 8.5 What to drop

- `rausch` as the product primary (demote to brand layer only).
- `babu` / `arches` as semantic stand-ins; replace with success/warning/danger/info tones.
- Pill-shaped **action** buttons (keep pills for status/badges/avatars).
- 12px cards, `shadow-card` / `shadow-pop` black-alpha shadows, `hover:bg-black`.
- The OS font stack, six weights, 15px body, 28px/800 page titles.
- Four button heights and six ad-hoc button patterns.
- Ad-hoc banners/notices per page → one `Alert` component (4 tones).
- The landing's 3-equal-card feature row, generic Unsplash hero, and extrabold 60px headline.
- `docs/design-system.md`'s Airbnb language as canonical (keep it as historical context; write a new canonical doc).

### 8.6 The one open brand decision

The structure is decided; the **accent** is a brand call:

| Option | What it means | Trade-off |
|---|---|---|
| **A. Full Velura emerald (recommended)** | Emerald-700 product primary; coral retired or kept only in the logo | Cleanest, best contrast, strongest premium read; loses the coral identity |
| **B. Emerald product + coral brand layer** | Emerald for actions; coral stays on logo/marketing/public jobs | Keeps recognition; slight dual-accent risk, needs a strict usage rule |
| **C. Keep coral primary** | Repaint Velura geometry but keep `#FF5A5F` actions | Cheapest; keeps the consumer signal and the 3.05:1 contrast failure — **not recommended** |

**Recommendation:** **B** if the coral logo has equity with stakeholders; **A** if the revamp is allowed to reset the brand. Both use the same system underneath, so this decision can be made after the primitives are built.

### 8.7 Effort, risks, guardrails

| Risk | Mitigation |
|---|---|
| Coral → emerald feels like a different product | Keep coral in the logo/marketing (option B); pilot the app shell + dashboard first and review |
| Density swings too airy | Use 44–48px rows, 16–20px gaps; do not copy Velura's 50px/24px rhythm wholesale |
| Landing-page skills push decoration into the app | Written rule: `design-taste-frontend` and `high-end-visual-design` govern marketing/auth only; app screens use Velura's doctrine + `VISUAL_DENSITY 7` |
| Dark mode becomes an accidental promise | Phase 1 is light-only; semantic tokens make it possible later; don't ship a half-built `.dark` |
| Contrast regressions | Use emerald-700 `#047857`; audit every button/input/placeholder; keep AA 4.5:1 |
| Scope creep across 15+ surfaces | Pilot 3 surfaces before sweeping; primitives first; no page-level overrides |
| Velura's drift gets copied | One StatusPill, one MetricCard, one Button, one toolbar/table recipe; lint for arbitrary hex/radius |

**Rough size:** the foundation + primitives + shell is a focused **3–5 days**; all product surfaces **1.5–2.5 weeks**; marketing/auth another **2–4 days**. The pilot de-risks the estimate.

---

## 9. Proposed rollout (for approval; no code yet)

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Decisions** | Accent A/B, font confirmation, light-only phase 1, new canonical design doc | Signed-off token table |
| **1. Foundations + primitives** | `globals.css` `@theme`, DM Sans, Button, Card, Field, StatusPill, Alert, EmptyState, Skeleton, DataTable, MetricCard | A primitive gallery page renders every state; contrast audited |
| **2. Shell + auth** | Sidebar active language, 56px topbar, 1700px container, PageHeader, login/register | Shell matches the recipe at 1440 and 390px |
| **3. Pilot surfaces** | Dashboard, employees list + record, leave | Three surfaces fully converted; no ad-hoc buttons/statuses; Playwright review |
| **4. Remaining modules** | Attendance, payroll, performance, recruitment, reports, notifications, admin, settings, public jobs | Every status uses the map; every page uses the recipe; no old tokens |
| **5. Marketing + polish** | Landing/auth mocks per `design-taste-frontend`; a11y sweep; reduced-motion; final Playwright pass | WCAG AA spot-check; no focus gaps; no dead code |

**F1–F17:** fold each finding into the phase that touches its surface, but the fix wave itself still requires explicit approval. Nothing in this document authorizes those fixes or any commit.

---

## 10. Confidence & evidence

**High confidence (measured or source-verified):**
- All HRMS tokens, type sizes, radii, shadows, component recipes and shell dimensions (`docs/current-design.md`, live `:3000`).
- All Velura tokens, type scale, radii, shell, status systems and live rendered values (`docs/Velura-Design.md`, source + live `velurahq.com`).
- The contrast failures: HRMS coral + white = **3.05:1**; Velura `#129174` + white = **3.94:1**; Velura shipped `#047857` + white = **5.48:1**.
- The skills' scopes (quoted from their own instructions).

**Medium confidence (design judgment):**
- The weighted scores and weights. The ranking is robust to reweighting; the exact numbers are not.
- "Premium" perception: based on the reference systems, not user testing.
- The claim that emerald fits HR/payroll better than coral. Domain convention supports it; HRMS stakeholders may disagree.

**Open questions:**
1. Accent option A vs B (the only brand-level fork).
2. Is DM Sans acceptable, or should HRMS use Satoshi/Geist for a distinct voice?
3. Is a dark theme required in this revamp, or is light-only v1 acceptable?
4. Does the coral logo have equity worth preserving?

**Reproduce:** `docs/current-design.md §8` (HRMS live samples), `docs/Velura-Design.md §2` (Velura live samples), `.playwright-mcp/*.png` (Velura screenshots), and the compiled Tailwind output under `apps/web/.next/static/css/` for the HRMS utility census.

---

*This document is a recommendation, not an implementation. Nothing has been committed; `Reference/` and the new docs remain untracked.*
