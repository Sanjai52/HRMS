# Velura — Design System Reference

> **Status:** Complete (uncommitted, per instruction). This document captures the design language of **VeluraHQ** (`www.velurahq.com`) as reference material for the HRMS UI revamp.
>
> **Companion decision doc:** [`docs/Velura-vs-HRMS.md`](./Velura-vs-HRMS.md) — side-by-side comparison, weighted scorecard, skill application, and the recommended translation into HRMS.
>
> **Evidence sources:**
> 1. **Source code** — the private repo cloned to `Reference/Velura` (Next.js App Router · TypeScript · Tailwind v3 + shadcn/ui "new-york" · Supabase). Extracted by five parallel read-only passes: foundations, UI primitives, marketing site, product app, effects/brand. *(Sections 3–7)_
> 2. **Live rendered evidence** — measured in-browser with Playwright against `https://www.velurahq.com` on **2026-10-19**, desktop viewport 1440×900, light mode, DM Sans fully loaded. *(Section 2)*
>
> **Caveat on measured values:** values are quoted exactly as the browser computed them. Several hairlines read `0.8px` rather than `1px` (client-side scaling artifact) — treat all of those as **1 px hairlines**. Screenshots live in `.playwright-mcp/` (untracked).

---

## 1. Brand snapshot

VeluraHQ is an **AI content-automation platform for SEO / web / content teams**. Its visual identity is a **light, airy, emerald-on-slate system**:

- Warm-white page (`#F8FAFC` slate-50) with pure-white cards and *very* quiet slate hairlines — the page reads almost white-on-white.
- A single **green brand family** (emerald/teal) used with discipline: primary CTAs, headline accent line, eyebrow dots, icon strokes, link colors, glows.
- Near-black **slate ink** (`#020617`–`#0F172A`) for headlines; muted slate for body copy.
- **Photographic hero backdrop** (sky-to-grass gradient photo) with a floating product screenshot in a browser-frame mockup.
- **One dark section** (near-black emerald `#040D0A`) used as a contrast band mid-page ("Market signals" insights strip, horizontal card carousel with glow blobs).
- Typography: **DM Sans (variable 100–1000)**, self-hosted via `next/font`; display sizes at **regular weight (400)** with tight tracking (−0.03em), support text at 600. Comfortable 1.65 body line-height.
- Radii are **tight and uniform (8px)** — even `rounded-xl`/`rounded-2xl` compute to 8px on the marketing site; only hero-frame mockups step up to 28px.
- Aesthetic reference read: *"premium SaaS"* in the Linear/Stripe-adjacent camp — quiet borders, soft slate-tinted shadows, generous 96–112px section rhythm, small uppercase letter-spaced micro-labels, no hard drop shadows, no skeuomorphism.

---

## 2. Live rendered evidence (measured, 2026-10-19)

### 2.1 Theme tokens — `:root` of marketing site (light)

| Token | Raw (HSL) | ≈ Hex | Measured use |
|---|---|---|---|
| `--background` | `210 40% 98%` | `#F8FAFC` | page background (slate-50) |
| `--foreground` | `222 47% 11%` | `#0F1729` | default ink (≈ slate-900) |
| `--card` | `0 0% 100%` | `#FFFFFF` | card surfaces |
| `--popover` | `0 0% 100%` | `#FFFFFF` | popovers |
| `--primary` | `166 78% 32%` | `#129174` | token green (teal-leaning emerald) |
| `--primary-foreground` | `210 40% 98%` | `#F8FAFC` | text on primary |
| `--secondary` | `210 40% 96%` | `#F1F5F9` | secondary surfaces (slate-100) |
| `--muted` | `210 40% 96%` | `#F1F5F9` | muted surfaces |
| `--muted-foreground` | `215 16% 46%` | `#637288` | body/muted text (≈ slate-500) |
| `--accent` | `160 84% 39%` | `#10B77F` | accent green (≈ emerald-500) |
| `--accent-foreground` | `210 40% 98%` | `#F8FAFC` | text on accent |
| `--destructive` | `0 84.2% 60.2%` | `#EF4444` | error red (Tailwind red-500) |
| `--destructive-foreground` | `210 40% 98%` | `#F8FAFC` | text on destructive |
| `--border` | `214 32% 91%` | `#E1E7EF` | borders (≈ slate-200) |
| `--input` | `214 32% 91%` | `#E1E7EF` | input borders |
| `--ring` | `166 78% 32%` | `#129174` | focus ring |
| `--radius` | `0.5rem` | `8px` | global radius |

**Notable:** chart tokens (`--chart-1..5`) are **not defined** on the marketing site root. And the **CTA buttons do not use the `--primary` token**: CTAs measure `rgb(4,120,87)` = **`#047857` (emerald-700)**, while `--primary` computes to `#129174` — confirmed in §3–4: marketing/header CTAs are emerald-* utility classes, and the token is consumed only by the shadcn `Button` `default` variant.

### 2.2 Typography (rendered)

- **Font in use:** `DM Sans` — self-hosted variable font, weight axis **100–1000**, two woff2 faces (`/_next/static/media/…`). Fallback stack: `"DM Sans", "DM Sans Fallback", system-ui, sans-serif` (fallback is Arial-based).
- **Declared but not loaded** on sampled pages: `"Nimbus Sans TW01"` (the `questly` family in `tailwind.config.ts`).
- Body: `16px / 26.4px (1.65) / 400`, color `#0F1729` on `#F8FAFC`.

| Role (measured) | Size | Line-height | Weight | Tracking | Color |
|---|---|---|---|---|---|
| Hero `h1` | `68px` | `69.36px` (1.02) | **400** | `−2.04px` (−0.03em) | `#020617` (slate-950) |
| Page `h1` (pricing) | `49.6px` | — | **600** | `−1.24px` (−0.025em) | `#020617` |
| Section `h2` | `44px` | `47.52px` (1.08) | 600 | `−1.1px` (−0.025em) | `#020617` |
| Card `h3` | `17px` | `28px` | 600 | `−0.176px` | `#020617` |
| Eyebrow pill text | ~10–11px | — | 500–600 | uppercase, letterspaced | emerald on emerald tint |
| Dark-section links | inherit | — | 500 | — | `#A7F3D0` (emerald-200) |

*Cross-check:* card `h3` = 17px matches the repo's overridden Tailwind `base` size `1.0625rem/1.75rem`; the enlarged type scale in code is real and shipped.

### 2.3 Site header (measured)

| Property | Value |
|---|---|
| Height | `64.8px` (≈64px + hairline) |
| Position | `sticky` |
| Background | `rgba(255,255,255,0.65)` + `backdrop-filter: blur(24px)` |
| Bottom border | hairline `rgba(255,255,255,0.5)` |
| Contents | logo + wordmark `VeluraHQ` (green plus/clover mark), nav `Platform ⌄ / Solutions ⌄ / Resources ⌄ / Pricing`, right: ghost button + primary button |

### 2.4 Buttons (measured instances)

| Instance | Background | Text | Radius | Padding | Height | Border |
|---|---|---|---|---|---|---|
| "Open workspace" (header, ghost) | `rgba(255,255,255,0.8)` | `#334155` (slate-700) | 8px | `8px 16px` | 43.6px | `rgba(167,243,208,0.8)` (emerald-200/80) |
| "Book a demo" (header, primary) | `#047857` (emerald-700) | `#FFFFFF` | 8px | `8px 16px` | 42px | — · subtle emerald-tinted shadow |
| "Book a demo" (home CTA band) | `#10B981` (emerald-500) | `#022C22` (emerald-950) | 8px | `14px 24px` | 54px | — |
| "Pricing calculator" (primary) | `#047857` | `#FFFFFF` | 8px | `12px 24px` | 51.6px | — |
| "Start for free" (on pricing) | `#047857` **or** `#020617` (slate-950) | `#FFFFFF` | 8px | — | 40px | — |
| "Talk to Sales" (on pricing) | `#020617` (slate-950) | `#FFFFFF` | 8px | — | 40px | — |
| "Generate" (inside mock UI, micro) | `#047857` | `#FFFFFF` | 8px | `6px 10px` | 28.5px | ring `rgba(5,150,105,0.2)` 0 0 0 1px + white inset |

**Patterns:** all buttons `font-weight: 500`, `font-size: 16px` (except micro), **8px radius, no drop shadows**; two-tone green system (emerald-700 fill / emerald-500 accent fill with dark emerald text); dark slate-950 fill exists as a secondary "serious" CTA.

### 2.5 Cards (measured instances)

| Card type | Radius | Background | Border | Shadow | Padding |
|---|---|---|---|---|---|
| Standard card | **8px** (`rounded-xl` *and* `rounded-2xl` both compute to 8px here) | `#FFFFFF` | hairline `rgba(226,232,240,0.9)` (slate-200/90) | soft slate-tinted stack, e.g. `rgba(15,23,42,0.08) 0 …` | `12px` (`p-3`) or `24px` (`p-5/sm:p-6`) |
| Pricing card | 8px | `#FFFFFF` | hairline `rgba(226,232,240,0.8)` | `0 12px 40px rgba(15,23,42,0.06)`; simpler cards `shadow-sm` (`0 1px 2px rgba(0,0,0,0.05)`) | `24px` or sectioned `p-0` |
| Premium framed panel | `28px` (`rounded-[1.75rem]`) | transparent | hairline `rgba(226,232,240,0.8)` | emerald-tinted ring `rgba(6,78,59,0.1)` + inset highlight `rgba(255,255,255,0.95) 0 1px 0 inset` | `48px` |
| Mock browser frame | 8px top | transparent | hairline `rgba(255,255,255,0.85)` | inset white highlight + emerald ring `rgba(6,78,59,0.06)` 0 0 0 1px | `0` |

**"Most popular" badge (pricing):** pill (`9999px`), bg `rgba(209,250,229,0.8)` (emerald-100/80), text `#065F46` (emerald-800), `11px`.

### 2.6 Section rhythm & backgrounds (measured)

| Section | Background | Padding-y |
|---|---|---|
| Hero | transparent (photo gradient: sky → grass) | `min-height: 100svh` |
| Value strip | `#FFFFFF` (border-b) | 48 / 56px |
| `#platform` | `#FFFFFF` | 112px |
| `#solutions` | `#FFFFFF` | 96px |
| `#how-it-works` | white (inner blocks) | 0 |
| `#insights` (**dark band**) | `rgb(4,13,10)` ≈ `#040D0A` | 64px |
| `#faq` | `#FFFFFF` | 112px |
| Below-fold band | transparent | 112px |

**Dark band details:** heading `44px/600 #FFFFFF`; small utility text `rgba(110,231,183,0.9)` (emerald-300/90, ~10px); link color `#A7F3D0` (emerald-200); decorative glow blobs `rgba(45,212,191,0.1)` (teal-400/10) as large `rounded-full` circles; insight cards carry the same 8px radius with emerald-dark tints, stat numbers large/bold, **negative trend arrow rendered amber**, positive emerald.

### 2.7 Hero composition (visual read)

Eyebrow pill (`● AUTOMATION PLATFORM FOR SEO, WEB, AND CONTENT TEAMS`, white pill, green dot, uppercase letterspaced) → two-line headline, second line in **emerald** → centered muted subcopy (3 lines) → row of white `rounded-full` source pills (ChatGPT / Perplexity / Gemini / Google AI Overviews) → two CTAs (`Book a demo →` emerald-700 fill + `Open workspace` white ghost with play-icon) → product screenshot in a browser mock (traffic-light dots, `app.velurahq.com/workspace` URL bar) showing the in-product workspace: left sidebar (`Overview`, `AI Search`), workspace title `Acme Growth`, emerald `Generate` button, and four metric cards with tiny uppercase labels (`MENTIONS 1,842` / `SHARE OF VOICE 31.2%` / `PAGES TRACKED 1,284` / `OPEN ACTIONS 412`).

> Note: metric-label styling inside that mock is a *rendered product screenshot*, not necessarily the live app's own type scale — the live app spec comes in Section 6.

### 2.8 Screenshots captured (untracked, `.playwright-mcp/`)

- `velura-home-hero.png` — homepage hero (1440×900)
- `velura-insights-dark.png` — dark "Market signals" band + FAQ eyebrow
- `velura-pricing.png` — pricing page header area

---

## 3. Foundations (from source)

*Extracted from `Reference/Velura` — all file refs below are relative to that directory.*

### 3.1 Stack & theming facts

| Item | Value | Ref |
|---|---|---|
| Framework | Next.js `^15.1.6` (App Router, `typedRoutes`, `reactStrictMode`); React `^19.1.0` | `package.json:46,52` |
| CSS engine | Tailwind **v3.4** (classic config — not v4); PostCSS = `tailwindcss` + `autoprefixer` only | `package.json:75`, `postcss.config.mjs:1-6` |
| shadcn/ui | style `"new-york"`, `baseColor: "neutral"` (nominal only), `cssVariables: true`, `rsc: true` | `components.json:2-10` |
| Animation plugin | `tailwindcss-animate ^1.0.7` — the only plugin | `tailwind.config.ts:122` |
| Theming lib | `next-themes ^0.4.6` — `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}` | `components/theme-provider.tsx:8` |
| Class merge | `cn()` via `tailwind-merge ^3.3.1`, default config | `lib/utils.ts:4-6` |
| Tailwind content globs | `./app/**`, `./components/**`, `./lib/**` (lib is scanned for classes) | `tailwind.config.ts:6-10` |
| Global CSS in root layout | `@xyflow/react/dist/style.css`, then `./globals.css` | `app/layout.tsx:4-6` |

### 3.2 Color tokens — light (the ONLY token set in the project)

| Token | Raw HSL | ≈ Hex | Role / notes | Ref |
|---|---|---|---|---|
| `--background` | `210 40% 98%` | `#F8FAFC` | page background (slate-50); re-applied on body | `globals.css:8,42` |
| `--foreground` | `222 47% 11%` | `#0F1729` | default ink (≈slate-900) | `globals.css:9` |
| `--card` / `--popover` | `0 0% 100%` | `#FFFFFF` | surfaces | `globals.css:10,12` |
| `--card-foreground` / `--popover-foreground` | `222 47% 11%` | `#0F1729` | | `globals.css:11,13` |
| `--primary` | `166 78% 32%` | `#129174` | custom teal-green (between emerald-700 & teal-700) | `globals.css:14` |
| `--primary-foreground` | `210 40% 98%` | `#F8FAFC` | | `globals.css:15` |
| `--secondary` | `210 40% 96%` | `#F1F5F9` | identical to `--muted` | `globals.css:16` |
| `--secondary-foreground` | `222 47% 11%` | `#0F1729` | | `globals.css:17` |
| `--muted` | `210 40% 96%` | `#F1F5F9` | | `globals.css:18` |
| `--muted-foreground` | `215 16% 46%` | `#637288` | secondary text (≈slate-500) | `globals.css:19` |
| `--accent` | `160 84% 39%` | `#10B77F` | **saturated green**, not a grey hover tint (shadcn deviation) | `globals.css:20` |
| `--accent-foreground` | `210 40% 98%` | `#F8FAFC` | | `globals.css:21` |
| `--destructive` | `0 84.2% 60.2%` | `#EF4444` | exact red-500 | `globals.css:22` |
| `--destructive-foreground` | `210 40% 98%` | `#F8FAFC` | | `globals.css:23` |
| `--border` | `214 32% 91%` | `#E1E7EF` | also the scrollbar-thumb color | `globals.css:24,242` |
| `--input` | `214 32% 91%` | `#E1E7EF` | byte-for-byte clone of `--border` | `globals.css:25` |
| `--ring` | `166 78% 32%` | `#129174` | identical to `--primary` | `globals.css:26` |
| `--radius` | `0.5rem` | `8px` | **orphan** — no `var(--radius)` consumer anywhere | `globals.css:27` |

**Tokens that do NOT exist:** `--chart-1…5` (absent), `--sidebar*` (absent), `--font-*` (none in CSS; `--font-dm-sans` is injected by `next/font` on `<html>` at `app/layout.tsx:13,21`).

**Token → Tailwind mapping** (`tailwind.config.ts:38-72`): `border`, `input`, `ring`, `background`, `foreground`, plus `{DEFAULT, foreground}` pairs for `primary`, `secondary`, `muted`, `accent`, `destructive`, `card`, `popover`. Nothing else.

> Because `accent` is green and `secondary`/`muted` are flat slate, the `baseColor: "neutral"` in `components.json` is nominal — the palette is a custom green system layered on slate greys.

### 3.3 Dark mode — wired but nonexistent

- **No `.dark` selector exists in any CSS file** (only unrelated class names `.workflow-dark-grid`, `.glass-3d-dark`).
- Tailwind is configured class-strategy (`darkMode: ["class"]`, `tailwind.config.ts:5`) and `next-themes` is mounted — but pinned to light (`components/theme-provider.tsx:8`).
- **Zero `dark:` utilities** in the entire TSX codebase (one false-positive in a data object).
- No theme toggle UI anywhere; the only dark-aware runtime logic flips an overlay inside `components/ui/animated-profile-card.tsx:362-363`.
- **Consequence:** the whole product renders in one fixed light theme; surfaces are hard-coded (`bg-white`, `bg-slate-*`, `border-slate-200`, `text-slate-950`) rather than token-driven. A dark mode would need to be built from scratch.

### 3.4 Non-token color system (hard-coded palette)

The brand palette is a **hard-coded Tailwind ladder**, not tokens: emerald-50/100/200/300/400/500/600/700/800/900 and teal-400/500, over slate-50/100/200/400/800/900 with occasional stone. **Shadows are tinted with emerald-800 ink `rgba(6,78,59,α)`** (or slate-900 `rgba(15,23,42,α)` for neutral floats) instead of black — a signature "green ink" elevation system. White overlays use a full alpha ladder (0.01→1.0) for glass layers.

**Outliers:** `#1ED760` (Spotify green) used only by `.insight-card-glow` hover (`globals.css:917-954`); `sky-500` used only by the 404 `tech-pulse`; a bespoke **near-white ramp** `#f8faf9` (marketing canvas, dozens of `bg-[#f8faf9]`), plus `#fbfaf7`, `#fafaf9`, `#fafcfb`, `#f4faf7` — these are not in any palette and should be promoted to tokens in any redesign.

**Reusable background/effect recipes defined in CSS:**

| Class | Exact definition (abridged to key color stops) | Ref |
|---|---|---|
| `.marketing-dot-grid` | white bg + `radial-gradient(circle, rgba(148,163,184,0.45) 1px, transparent 1px)` / 22px | `globals.css:54-59` |
| `.bento-dot-bg` | `radial-gradient(circle, rgba(6,78,59,0.1) 1px, transparent 1px)` / 18px | `61-64` |
| `.solutions-section-bg` | `radial-gradient(ellipse 70% 45% at 50% 0%, rgba(16,185,129,0.07), transparent 55%)` + `linear-gradient(180deg,#ffffff 0%,#fafcfb 55%,#f4faf7 100%)` | `67-71` |
| `.workflow-dot-grid` | `radial-gradient(circle, rgba(16,185,129,0.2) 1px, transparent 1px)` / 16px | `276-279` |
| `.workflow-dark-grid` | 1px linear-gradient grid `rgba(52,211,153,0.09)` / 44px + radial mask | `281-287` |
| `.hero-mesh` | 3× emerald radial gradients (`rgba(16,185,129,0.14)`, `rgba(52,211,153,0.1)`, `rgba(6,95,70,0.08)`) over `linear-gradient(180deg,#f8faf9 0%,#f0fdf4 40%,#ecfdf5 100%)` | `741-747` |
| `.hero-grid-3d` | 1px grid `rgba(16,185,129,0.06)` / 48px + elliptical mask | `749-755` |
| `.hero-sky-tint` | white/emerald-50 gradient veil + emerald radial `rgba(16,185,129,0.12)` | `689-693` |
| `.hero-dashboard-glow` | `radial-gradient(ellipse 80% 60% at 50% 50%, rgba(16,185,129,0.18), transparent 70%)` | `729-731` |
| `.case-studies-hero-mesh` | emerald + teal radials + `case-studies-mesh-drift 16s` animation | `699-704` |
| `.case-studies-hero-grain` / `.bento-film-grain` | SVG `feTurbulence` noise data-URI (opacity 0.5; film grain adds `mix-blend-mode: overlay`) | `695-697, 956-959` |
| `.green-glow` | `0 0 0 1px rgba(16,185,129,0.15), 0 0 40px rgba(16,185,129,0.12), 0 0 80px rgba(16,185,129,0.06)` | `810-815` |
| `.text-gradient-green` | `linear-gradient(135deg,#064e3b 0%,#059669 45%,#10b981 100%)` clipped to text | `1180-1185` |
| `.not-found-digit` | `linear-gradient(135deg,#047857 0%,#10b981 42%,#34d399 72%,#6ee7b7 100%)` clipped to text | `817-823` |
| `.platform-bar-fill` | `linear-gradient(90deg,#064e3b 0%,#059669 45%,#34d399 100%)` + emerald glow | `1173-1178` |
| `.platform-bar-track` | emerald-800-tinted inner gradient + `inset 0 1px 3px rgba(6,78,59,0.06)` | `1167-1171` |
| `.app-loader-arc` | emerald `conic-gradient` comet ring + radial mask, 9999px | `171-196` |
| `.liquid-glass` | `rgba(255,255,255,0.01)` + `backdrop-blur(4px)` + masked 1.4px gradient border | `1334-1360` |
| Pricing range | track `#059669 → #e2e8f0`, thumb `2px solid #047857` on white, focus halo `rgba(5,150,105,0.25)` | `1363-1433` |

**Tailwind config literals:** `bg-slate-grid` background-image (unused), `shadow-glow: 0 20px 80px rgba(0,0,0,0.28)` (unused) — `tailwind.config.ts:79,117-118`.

**Recurring raw hex sampled in TSX:** `#f8faf9` marketing canvas (`components/marketing/marketing-shell.tsx:21`), `#fbfaf7` "paper" panels (`platform-visual.tsx:79,152,216`), `#071612` dark CTA stage (`home/cta-section.tsx:39`), `#171f1c` dark blog card (`blog-featured-card.tsx:47`), `#eef2f0` cinema backdrop, macOS traffic dots `#ff5f57 / #febc2e / #28c840`, `#1a6b52` robot glow.

### 3.5 Typography

**Font loading (exact):**

- Primary: **DM Sans** via `next/font/google` — `subsets:["latin"]`, `variable:"--font-dm-sans"`, `display:"swap"`; **no `weight` option** → self-hosted variable font (wght axis 100–1000). Applied on `<html>` (variable) **and** `<body>` (className) — `app/layout.tsx:11-15,21-22`.
- Secondary (remote, third-party CDN): `@import url('https://db.onlinewebfonts.com/c/…?family=Nimbus+Sans+TW01')` — **first line of the global stylesheet**, CSP-allowlisted — used only by the Questly marketing navbar (`globals.css:1`, `next.config.ts:43-44`, `components/marketing/questly/navbar.tsx:12`).
- Runtime extras: Roboto Flex (VariableProximity CSS module), a style-tag `@import` in `TextPressure.tsx:119`.

**fontFamily map** (`tailwind.config.ts:20-24`): `font-sans` = `var(--font-dm-sans), system-ui, sans-serif`; `font-marketing` = same (applied via `.marketing-font`, `globals.css:49-51`); `font-questly` = Nimbus Sans TW01 stack. **`font-mono` is overridden outside Tailwind** to `SFMono-Regular, Consolas, …` for `code, kbd, pre, .font-mono` (`globals.css:215-221`), authored after `@tailwind utilities` so it wins.

**Custom fontSize scale** (`tailwind.config.ts:25-37`) — replaces every default step:

| Class | Size | Line-height | (Tailwind default for comparison) |
|---|---|---|---|
| `text-xs` | `0.875rem` / 14px | `1.375rem` / 22px | 12px |
| `text-sm` | `1rem` / 16px | `1.625rem` / 26px | 14px |
| `text-base` | `1.0625rem` / 17px | `1.75rem` / 28px | 16px |
| `text-lg` | `1.1875rem` / 19px | `1.9rem` / 30.4px | 18px |
| `text-xl` | `1.3125rem` / 21px | `1.9rem` / 30.4px | 20px |
| `text-2xl` | `1.5625rem` / 25px | `2.125rem` / 34px | 24px |
| `text-3xl` | `1.9375rem` / 31px | `2.375rem` / 38px | 30px |
| `text-4xl` | `2.3125rem` / 37px | `2.625rem` / 42px | 36px |
| `text-5xl` | `3.0625rem` / 49px | `1.05` unitless | 48px |
| `text-6xl` | `3.8125rem` / 61px | `1.02` unitless | 60px |
| `text-7xl` | `4.5625rem` / 73px | `1` unitless | 72px |
| `text-8xl`, `text-9xl` | untouched defaults (96 / 128px) | | discontinuity after 7xl |

Scale logic: `text-base` offset to 17px, growth ≈×1.26→×1.2; `5xl+` switch to unitless line-heights. (Live cross-check: rendered card `h3` = 17px — the scale really ships.)

**Body-level settings** (`globals.css:40-47`): `font-size: 1rem`, `line-height: 1.65`, `letter-spacing: -0.011em`, `overflow-x: hidden`, `antialiased` + `-webkit-font-smoothing: antialiased` / `-moz-osx-font-smoothing: grayscale` (`globals.css:34-38`).

**Conventions:** no prose plugin, no `text-balance`/`text-pretty` anywhere (grep-verified); headings use `tracking-tight` (sampled across app + marketing); eyebrows = `text-[11px] font-semibold uppercase tracking-[0.16em]` (tables) up to `tracking-[0.24em]` (auth screens) — e.g. `components/data-table.tsx:25`, `components/metric-card.tsx:42`, `app/(auth)/login/page.tsx:50,81`.

### 3.6 Radii

| Token / class | Value | Note | Ref |
|---|---|---|---|
| `rounded-xl` | `0.5rem` / 8px | default was 12px — **shrunk** | `tailwind.config.ts:74` |
| `rounded-2xl` | `0.5rem` / 8px | default was 16px — **shrunk** | `tailwind.config.ts:75` |
| `rounded-3xl` | `0.5rem` / 8px | default was 24px — **shrunk** | `tailwind.config.ts:76` |
| `rounded-lg` | `0.5rem` / 8px | untouched default — so **lg == xl == 2xl == 3xl == 8px** | default |
| `rounded-md / DEFAULT / sm` | `0.375 / 0.25 / 0.125rem` | only steps below 8px | default |
| Arbitrary values used | `rounded-[22px]`, `[1.35rem]`, `[30px]`, `[20px]`, `[16px]` | e.g. `components/marketing/platform-feature.tsx:224`, `blog-hero-cinema-stage.tsx:49` | |
| Hard-coded in CSS | 9999px pills/scrollbar/loader, 30px tablet chassis, 20px tablet screen, 16px browser window, 50% range thumb | `globals.css` | |

### 3.7 Shadows — the "green ink" elevation system

Design rule: outer elevation tinted **emerald-800 `rgba(6,78,59,α)`** for green contexts / **slate-900 `rgba(15,23,42,α)`** for neutral floats, plus a `0 0 0 1px` hairline and an `inset 0 1px 0 rgba(255,255,255,α)` top highlight on glass. Representative definitions (full set in `globals.css`):

| Name | Exact value (abridged) | Ref |
|---|---|---|
| `.workflow-browser` | `0 1px 2px rgba(15,23,42,0.04), 0 18px 50px rgba(6,78,59,0.1), 0 48px 100px rgba(15,23,42,0.08)` | `289-294` |
| `.integration-card` | `0 0 0 1px rgba(255,255,255,0.8), 0 2px 4px rgba(6,78,59,0.04), 0 8px 24px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,0.95)`; hover swaps to emerald `0 0 0 1px rgba(16,185,129,0.12) … 0 16px 40px rgba(6,78,59,0.12)` + `translateY(-3px)` | `531-549` |
| `.glass-3d` | `0 0 0 1px rgba(16,185,129,0.06), 0 4px 24px rgba(6,78,59,0.06), inset insets…` + `backdrop-blur(20px) saturate(1.4)` | `608-612` |
| `.glass-3d-stack` | `0 0 0 1px rgba(16,185,129,0.08), 0 8px 32px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.95)` — deliberately no backdrop-filter (60fps scroll) | `624-627` |
| `.nav-dropdown-panel` | `0 24px 64px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.03)` | `657-660` |
| `.glass-command-center` | 6-layer stack: emerald ring + `0 12px 40px rgba(6,78,59,0.1)` + `0 32px 80px rgba(6,78,59,0.08)` + insets; hover intensifies | `967-975, 1115-1123` |
| `.tablet-chassis` | `0 28px 70px rgba(15,23,42,0.28), 0 48px 120px rgba(6,78,59,0.16)` + insets; hover adds emerald `0 60px 140px rgba(16,185,129,0.18)` | `983-989, 1058-1065` |
| `.browser-window` | `0 0 0 1px rgba(16,185,129,0.12), 0 4px 12px rgba(6,78,59,0.06), 0 20px 48px rgba(6,78,59,0.12), 0 40px 80px rgba(15,23,42,0.1)`; hover intensifies | `998-1012` |
| `.glass-kpi-chip` / `.glass-chart-well` / `.glass-live-badge` | inset white highlight + emerald-tinted soft shadows | `1130-1164` |
| `.insight-card-glow` hover | `0 0 0 1px rgba(30,215,96,0.85), 0 0 5px rgba(30,215,96,0.75), 0 0 10px rgba(30,215,96,0.35)` (Spotify green — one-off) | `940-953` |
| Component-level echoes | `shadow-[0_8px_30px_rgba(6,78,59,0.06)]` (`components/cowork/CoworkWorkspace.tsx:891`), `shadow-[0_4px_16px_rgba(6,95,70,0.20)]` (`:1103`), `shadow-[0_12px_40px_rgba(6,78,59,0.05)]` (`platform-feature.tsx:83`) | |

### 3.8 Layout

| Item | Value | Ref |
|---|---|---|
| Container plugin | `center: true`, padding `1.5rem`, **only** a 1400px `2xl` cap — **never used in code** (real convention: `mx-auto max-w-7xl`, 80 occurrences) | `tailwind.config.ts:12-18` |
| Breakpoints | Tailwind defaults (640/768/1024/1280/1536) | — |
| Marketing width/padding | `mx-auto max-w-7xl` sections; `px-4 md:px-6` sections, `px-5 sm:px-8 lg:px-10` nav | `marketing-shell.tsx:27-28,48` |
| App shell | `h-screen overflow-hidden bg-slate-50/40`; main scroll area carries `bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(16,185,129,0.04),transparent_60%)]`, `p-4 sm:p-5 lg:p-6` | `app/(application)/workspace/layout.tsx:19-24` |
| Global media rule | `img, svg, video { max-width: 100% }` (exception react-flow svg) | `globals.css:253-261` |
| Z-index codified | 1 (glass shine), 8 (flow edges), 12 (flow nodes), 20 (glow ::after) | `globals.css:682, 934` |
| Perf helpers | `.gpu-layer`, `.section-below-fold` (`content-visibility:auto`), `will-change` on marquees | `globals.css:630-638, 723-727` |
| Responsive rules in CSS | **none** — only the 10 `prefers-reduced-motion` blocks | `globals.css` |

### 3.9 Motion

**House easing:** signature `cubic-bezier(0.22, 1, 0.36, 1)` (easeOutQuint) on all "rise" reveals and glass hovers. Reveal durations `0.9s` (fade-up/grow-x), `1.1s` (hero-rise), `0.7s` (fade-down), `0.6s` (blur-rise). Glass transitions `0.3–0.65s`. Links `transition-colors` 150ms. Marquee durations range 16s–45s, `linear infinite`, most pause on hover.

**Keyframes inventory (33 in `globals.css` + 5 in config):** `fade-up`/`fade-down`/`hero-rise` (blur+rise reveals); `app-loader-spin`/`-reverse`/`breathe`/`dot` (loading); `workflow-flow`/`-rail`/`-stage-travel`/`-marquee` (animated workflow diagram); `blur-rise-top/bottom`; `blog-marquee`, `marquee-x/-reverse/-y/-reverse` (hand-rolled marquees); `integration-flow` (dash-offset line); `grow-x`; `case-studies-mesh-drift`; `float-y`; `orbit-spin` + `line-draw` (**orphans, no consumers**); `glow-pulse`; `not-found-glitch-skew`/`ken-burns`/`tech-pulse` (404 playfulness); `hero-robot-wave-left/right` + `hero-robot-float` (mascot); `spline-spin`; `gradient-rotate` (drives registered `@property --gradient-angle` — the only registered custom property) + `border-beam-spin`. Config: `animate-spotlight`, `accordion-down/up`, `animate-marquee`/`-vertical` (`var(--duration, 40s)`, `var(--gap)`).

**Reduced-motion:** handled class-by-class in **10** `prefers-reduced-motion` blocks covering the codified animations (incl. killing transitions on the glass/device hovers) — but **misses** `scroll-behavior: smooth`, the Tailwind-plugin marquees, the Spline spinner, and the animated border-beam family.

### 3.10 Global behavior & misc

| Item | Status | Ref |
|---|---|---|
| `::selection` | **not styled** | — |
| `::placeholder` | per-component (`placeholder:text-muted-foreground` / `slate-400`) | `components/ui/input.tsx:12` |
| Print styles | none | — |
| Global border reset | `* { @apply border-border }` — every element defaults to token border color | `globals.css:30-32` |
| Scrollbar | `scrollbar-width: thin`, thumb `hsl(var(--border))`, WebKit 10px, hover `hsl(var(--muted-foreground) / 0.42)` | `227-251` |
| Focus rings | no global rule; convention = `ring-2 ring-ring` (`#129174`), often `/40` alpha, + `focus-visible:border-emerald-300` hue shift | `components/ui/button.tsx:8` |
| Smooth scrolling | `html { scroll-behavior: smooth }` — unconditional | `globals.css:34-35` |
| `color-scheme` / `theme-color` | neither set | — |
| React Flow | edges z-8, nodes z-12, `svg` overflow visible | `253-273` |
| `!important` | 5 purposeful uses (border-rotate reveal overrides, insight glow) | `939, 1319-1326` |

## 4. UI primitives (from source)

*Extracted from `Reference/Velura/components/` — refs relative to that directory.*

### 4.1 Shared recipes every primitive inherits

| Recipe | Exact classes |
|---|---|
| Emerald icon tile (9/10/14) | `flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600` · same with `h-10 w-10` · `h-14 w-14 rounded-2xl` (empty state) |
| Eyebrow / overline | `text-[11px] font-semibold uppercase tracking-[0.16em]` — slate-400/500 or `text-emerald-700`; widest variant `tracking-[0.22em]` (bento), `[0.24em]` (auth) |
| Snapshot pill shape | `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold` (Badge/StatusPill) |
| Card shadow ladder | rest `shadow-[0_8px_30px_rgba(6,78,59,0.06)]` → hover `shadow-[0_16px_40px_rgba(6,78,59,0.10)]` → feature `shadow-[0_20px_50px_rgba(6,78,59,0.1)]`; primary-button glow `0 4px 16px rgba(6,95,70,0.20)` → `0 6px 20px rgba(6,95,70,0.26)` |
| Emerald emphasis system | border `emerald-100`, fill `emerald-50` (or `/30 /50 /60`), text `emerald-600/700`, hover border `emerald-200`, hover fill `emerald-100`, strong action `emerald-500` |
| Focus ring #1 (text controls) | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40` **+** `focus-visible:border-emerald-300` |
| Focus ring #2 (buttons) | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1` |
| Focus ring #3 (marketing nav) | `focus-visible:ring-[3px] focus-visible:ring-emerald-500/20 focus-visible:outline-1` |
| (gaps) | Sidebar nav rows, Tabs buttons have **no** focus-visible styling; Sheet close uses `focus:` not `focus-visible:` |
| Disabled | `disabled:pointer-events-none disabled:opacity-50` (buttons); `disabled:cursor-not-allowed disabled:opacity-50` (controls) |
| Transitions | default `transition-colors` (150ms); 200ms chevrons/collapse; 300ms card lift/sheet close; 500ms sheet open; 700ms image zoom |
| Icon scale (lucide `^0.542.0`) | `h-4 w-4` generic · `h-3.5 w-3.5` dense/buttons · `h-3 w-3` trend arrows · `h-[18px]` 9-tile · `h-5 w-5` 10-tile · `h-6 w-6` empty-state. Active sidebar icons use `strokeWidth={2.2}` |

### 4.2 Buttons — `ui/button.tsx` (custom CVA)

Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[background-color,border-color,box-shadow,transform] focus-visible:…ring-ring…ring-offset-1 disabled:pointer-events-none disabled:opacity-50` (`button.tsx:8`)

| Variant | Classes | Look |
|---|---|---|
| `default` | `bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(6,95,70,0.20)] hover:bg-primary/90 hover:shadow-[0_6px_20px_rgba(6,95,70,0.26)]` | teal-emerald `#129174` with soft glow |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | slate-100 |
| `outline` | `border border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800` | white → emerald hover |
| `ghost` | `text-slate-600 hover:bg-slate-100 hover:text-slate-900` | chrome-free |

Sizes: `default` `h-10 px-4` (40px) · `sm` `h-9 rounded-lg px-3` (36px) · `lg` `h-11 px-6` (44px) · `icon` `h-10 w-10`. **No `destructive` or `link` variant** — destructive actions are hand-painted (`className="bg-rose-600 hover:bg-rose-700"`, `bg-rose` outlines) per call-site.

### 4.3 Cards & surfaces

| Component | Recipe |
|---|---|
| `Card` | `rounded-2xl border border-slate-200/70 bg-card text-card-foreground shadow-[0_8px_30px_rgba(6,78,59,0.06)]`; slots `CardHeader p-6 space-y-1.5` / `CardTitle text-lg font-semibold tracking-tight` / `CardDescription text-sm text-muted-foreground` / `CardContent p-6 pt-0` / `CardFooter p-6 pt-0` (`card.tsx`) |
| `StatCard` | Card + `p-5`, hover `shadow-[0_16px_40px_rgba(6,78,59,0.10)]`; label `text-[11px] … text-muted-foreground`; value `mt-2 text-2xl font-semibold tracking-tight text-slate-900`; icon tile 40px; trend handled by external `Delta` (`components/ai-search/shared.tsx:157` — `text-emerald-600` / `text-rose-600` / `text-slate-500`, `tabular-nums`) |
| `MetricCard` (dashboard) | Card + `group … hover:-translate-y-0.5 hover:border-emerald-200/80 hover:shadow-[0_16px_40px_rgba(6,78,59,0.10)] duration-300`; label `text-[11px] … text-slate-400`; value **28px** `leading-none`; icon tile 36px deepening on hover; built-in trend pills `bg-emerald-50/rose-50/slate-100` with `h-3 w-3` arrows (`metric-card.tsx`) |
| `EmptyState` | centered `px-6 py-16`; 56px emerald icon tile `rounded-2xl`; `<h3 text-base font-semibold text-slate-800>`; desc `max-w-sm text-sm text-slate-500`; action `mt-5` |
| `PageHeader` + `PageContainer` | header: eyebrow `text-[11px] … tracking-[0.18em] text-emerald-700`, 36px icon tile, **`<h1> text-2xl font-semibold tracking-tight text-slate-900`** (25px), actions right; container: `mx-auto w-full max-w-[1700px]` (`narrow` 768px); real padding lives on the shell `<main>` `p-4 sm:p-5 lg:p-6` |
| `FormField` | `space-y-1.5`; label `text-xs font-semibold text-slate-600` + required `*` rose-500; error `text-[11px] font-medium text-rose-500`; hint `text-[11px] text-slate-400` |
| `GlassCard` (dark orbit card) | **unused in product**; `rounded-[2rem]/[2.35rem]` dark emerald gradient `from-[#041912] via-[#062a1f] to-[#0a3d2e]`, orbit rings `bg-emerald-300/10`, white core disc, rotate3d(1,1,0,22deg) hover — the only big-radius component in the system |
| `GridCard` / `BentoGrid` (marketing) | GridCard: white tile `rounded-lg border-emerald-100 px-4 py-3.5`, skewed masked `GridPattern` (30px cells, `fill-emerald-200/30`), conic-gradient `#059669→#34d399→#047857` blur 50px at 12% on hover. Bento: `rounded-2xl border-emerald-100/80 p-4 shadow-[0_8px_30px_rgba(6,78,59,0.06)]`, eyebrow `tracking-[0.22em]`, stat `text-lg … text-emerald-700`, **9px** micro-labels, chip bullets `border-emerald-100 bg-emerald-50/60 text-[10px]` |
| `ProductCard` (blog highlight) | pointer-tilt 3D card, ±12°, grid texture 32px `rgba(16,185,129,0.07)`, cursor glow `radial-gradient(100px … rgba(16,185,129,0.35))`, floating logo with `ring-1 ring-emerald-100/80 shadow-[0_12px_28px_rgba(6,95,70,0.18)]` |

### 4.4 Form controls

| Control | Key spec |
|---|---|
| `Input` | `h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm` + focus recipe #1; `placeholder:text-muted-foreground` (`input.tsx:12`) |
| `Select` | **native `<select>`** (server-friendly): `h-10 … appearance-none … pl-3 pr-9 text-sm text-slate-800` + chevron `absolute right-3 … h-4 w-4 text-slate-400`; toolbar usages append `h-9` (`select.tsx`) |
| `Textarea` | **stock shadcn, un-migrated**: `rounded-md` (6px!), `border-input bg-background`, plain `ring-2 ring-ring`; callers patch to the 8px/emerald recipe ad hoc |
| `FancySelect` | zero-dep custom listbox: trigger = Input recipe + `hover:border-slate-300`; menu `absolute z-50 mt-1.5 max-h-64 rounded-xl border-slate-200/70 bg-white p-1 shadow-[0_16px_40px_rgba(6,78,59,0.12)]`; selected option `bg-emerald-50 font-medium text-emerald-700` + `Check` icon; keyboard + click-outside handled; hidden input for forms (`fancy-select.tsx`) |
| `Toolbar` / `SearchInput` | `flex flex-wrap items-center gap-2`; search `h-10 rounded-xl border-slate-200 bg-white pl-9 pr-3` + icon `left-3 text-slate-400`; **no disabled styling** (`toolbar.tsx`) |

### 4.5 Status system — `ui/status-pill.tsx` (canonical)

Pill: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize` + 6×6px dot.

| Tone | Classes (border / bg / text / dot) |
|---|---|
| emerald | `border-emerald-200 bg-emerald-50 text-emerald-700` / dot `bg-emerald-500` |
| amber | `border-amber-200 bg-amber-50 text-amber-700` / `bg-amber-500` |
| rose | `border-rose-200 bg-rose-50 text-rose-700` / `bg-rose-500` |
| sky | `border-sky-200 bg-sky-50 text-sky-700` / `bg-sky-500` |
| violet | `border-violet-200 bg-violet-50 text-violet-700` / `bg-violet-500` |
| slate | `border-slate-200 bg-slate-50 text-slate-600` / `bg-slate-400` |

**Status dictionary:** `queued/new/pending/draft` → slate · `running/in_progress/processing/paused/warning` → amber (warning = "Needs attention") · `needs_input/awaiting_review/review` → violet · `complete/completed/published/active/healthy` → emerald · `failed/rejected/blocked/error` → rose · `cancelled/archived` → slate. Unknown strings silently become grey pills (`capitalize` + `_`→space) — can mask missing mappings.

⚠️ **Second status system exists:** `components/status-badge.tsx` (Badge-based, `rounded-md` 6px, `font-medium`) **disagrees** — `queued` = sky ("Queued"), `running` = violet ("Running"). Used on dashboard only. Reconcile before porting.

### 4.6 Data table — `components/data-table.tsx`

| Part | Classes |
|---|---|
| Desktop shell | `hidden overflow-hidden rounded-lg border border-slate-200 md:block`; scroll `overflow-x-auto`; `<table> w-full min-w-[720px] text-left text-sm` |
| Header | `<thead> bg-slate-50 text-xs uppercase tracking-[0.16em] text-muted-foreground`; `<th> px-4 py-3 font-medium` (≈46px row) |
| Body | `divide-y divide-slate-200`; rows `bg-white … hover:bg-slate-50` (**no zebra**); `<td> px-4 py-3 align-middle` (≈50px row) |
| Mobile (<768px) | card list `space-y-3`; card `rounded-lg border border-slate-200 bg-white p-4`; field rows label/value with `text-xs uppercase tracking-[0.16em]` labels, values right-aligned ≥sm |
| Pagination | no component — "Load more" full-width `outline` Button inside `Card > CardHeader("Showing X of Y") > CardContent space-y-4` (e.g. `ai-search/history/page.tsx:165-186`) |

No sorting/selection/bulk tooling; `column.header` is used as React key (collision risk); no `aria-sort`/`scope`.

### 4.7 Overlays & navigation

| Component | Spec |
|---|---|
| `Dialog` | **native `<dialog>` with `showModal()`** — `rounded-xl border-border bg-background p-0 shadow-2xl backdrop:bg-black/50`, inline `minWidth: min(90vw,500px) / maxHeight 85vh`, body `p-6 space-y-4`; no animations, no max-width; title `text-lg font-semibold leading-none`; footer right-aligned ≥sm (`dialog.tsx`) |
| `Sheet` | Radix Dialog: overlay `bg-black/40 backdrop-blur-sm`; content `bg-white … open:duration-500 / close:300`; side panels `w-3/4 … sm:max-w-sm` with `border-emerald-100` edges; **header/footer `border-emerald-100 bg-emerald-50/30 p-4`**; close `absolute top-5 right-5 rounded-full … focus:ring-emerald-500/30` (`sheet.tsx`) |
| `Tabs` | custom segmented: track `inline-flex gap-1 rounded-xl border-slate-200 bg-slate-50 p-1`; tab `rounded-lg px-3 py-1.5 text-sm font-medium`; active `bg-white text-emerald-700 shadow-sm`; count chip `bg-emerald-100 text-emerald-700 text-[10px]` (`tabs.tsx`) |
| `Accordion` | radix, re-themed: items `border-b border-emerald-100`; trigger `py-4 text-sm font-semibold text-slate-900 hover:text-emerald-800`; chevron `text-emerald-700` rotating 200ms (`accordion.tsx`) |
| `NavigationMenu` (marketing mega-menu) | trigger `h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-900`; viewport panel `rounded-xl border-emerald-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]`; custom item shapes `NavGridCard` (embeds GridCard), `NavSmallItem` (40px min row, trailing arrow `opacity-0 → 100` on hover), `NavLargeItem` (bordered emerald card), `NavItemMobile` (40px icon tile). ⚠️ Uses Tailwind-v4-only `**` variant + non-existent `origin-top-center` → no-ops on v3 (`navigation-menu.tsx:104,121`) |
| `Avatar`, `Skeleton` | Avatar stock (used only in demos); Skeleton 0 imports (dead) |

### 4.8 App chrome

| Area | Spec (`components/`) |
|---|---|
| App sidebar | `<aside class="hidden h-full w-60 shrink-0 border-r border-slate-200/70 bg-white px-3 py-3 lg:flex lg:flex-col">` — **240px, desktop-only**; sections labeled `text-[10px] … tracking-[0.16em] text-slate-400` (Workspace / Agents / Library); rows `h-9 … rounded-lg px-3 text-[13px] font-medium` (only 13px nav type); active `bg-emerald-50 text-emerald-700` + **3×16px active indicator bar** `rounded-r-full bg-emerald-500`; icons 17px (sub 15px) with `strokeWidth 2.2` active; sub-items `ml-[18px] border-l border-slate-200 pl-2.5`; collapse via `grid-template-rows 1fr→0fr` 200ms (`app-sidebar.tsx`, `sidebar-nav.tsx`) |
| Site header | `sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl`; bar `h-14` (**56px**); brand column `lg:w-60 lg:border-r` (aligns with sidebar divider); search zone `max-w-md hidden md:flex`; workspace switcher `Button variant=outline` (`workspace-switcher.tsx`) |
| Mobile nav | Sheet drawer `w-[16rem] max-w-[82vw] p-0`; trigger `h-9 w-9 rounded-lg … lg:hidden` |
| Global search | Input `pl-9` combobox; panel `absolute z-50 mt-2 rounded-lg border-slate-200 bg-popover shadow-[0_24px_60px_rgba(15,23,42,0.16)]`; rows with type chips `rounded-full border-slate-200 px-2 py-0.5 text-[11px]`; footer kbd hints `text-[11px]`; debounce 250ms / min 2 chars / max 10 results; 15 hardcoded shortcuts (a11y: `aria-controls` target has no role) |
| Logo | `/logo.svg` via next/image (64×64 source), wrapper `flex items-center gap-2.5`, wordmark `text-sm font-semibold tracking-tight text-slate-950` "VeluraHQ"; header variant `h-7 w-7` + `text-[13px] uppercase tracking-[0.18em]` wordmark |

### 4.9 Motion primitives (CSS-only by design)

- **`AppLoader`** — the mandated in-app loading state (Server-Component safe): emerald `conic-gradient` comet ring (0.95s spin) + inner teal ring (1.5s reverse) + white brand core (breathe 2.4s) + 3px thinking dots (1.2s), `role="status" aria-live="polite"`; sizes 56px compact / 76px full; reduced-motion handled (`app-loader.tsx`, `globals.css:171-213`).
- **`Reveal`** — entrance wrapper: `animate-fade-up` (`0.9s cubic-bezier(0.22,1,0.36,1) both`, opacity+24px rise+6px blur out), optional `animationDelay`; used page-level with staggered `delay={60/120}` (`reveal.tsx`).
- **Rule (documented in code):** layout/entrance motion must be CSS-only (RSC-safe, reduced-motion aware); `motion/react` reserved for pointer-reactive marketing cards.

### 4.10 Markdown renderer — `ui/markdown.tsx`

Dependency-free: `space-y-3 text-sm leading-relaxed text-slate-700`; inline code `rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-700`; links emerald underlined `decoration-emerald-300 underline-offset-2`; blockquote `border-l-2 border-emerald-200 pl-3 text-slate-500`; **code block = the only dark surface in the app** `rounded-xl border-slate-800 bg-slate-900 px-3.5 py-3 text-xs text-slate-100`; its own table styling (header `bg-slate-50 text-[11px] uppercase tracking-[0.12em]`).

### 4.11 Stock vs custom inventory (for porting decisions)

- **Fully custom (no shadcn equivalent):** Select (native), Dialog (native), Tabs, Toolbar, StatusPill, StatCard, PageHeader, PageContainer, EmptyState, FormField, FancySelect, Markdown, AppLoader, Reveal, GridCard, BentoGrid, DataTable, MetricCard, ProgressRow (dead), StatusBadge (legacy), VeluraLogo.
- **Customized shadcn:** Button (radius/glow/variants), Card (radius/border/shadow), Input (radius/emerald focus), Sheet (emerald theme), Accordion (emerald), NavigationMenu (emerald + 4 custom item shapes).
- **Stock:** Badge, Avatar, Skeleton (dead). **Un-migrated:** Textarea (6px radius — the odd one out).
- **Not installed:** Radix select/tabs/dropdown/tooltip/popover; no `ui/table.tsx` (DataTable is bespoke). Installed Radix: accordion, avatar, dialog, navigation-menu, slot.

### 4.12 Primitive-level quirks (feed §8)

1. Two competing status systems (above); `queued`/`running` disagree.
2. No destructive/link Button variant; `--destructive` never used; destructive actions hand-painted per call-site.
3. Three border conventions: `border-slate-200/70` (Card/header/sidebar), `border-slate-200` (inputs/table), `border-emerald-100` (Sheet/Accordion/NavMenu/tiles) + `border-border` (Dialog/Badge).
4. StatCard vs MetricCard drift: value 25px vs 28px, label muted vs slate-400, tile 40 vs 36px, external vs built-in trend.
5. Dialog ≠ Sheet: native vs Radix, different scrims (50% no blur vs 40% + blur), different chrome (none vs emerald striped), different radii (8px both via flatten, but Sheet edges tinted).
6. Focus gaps: sidebar rows, Tabs, mobile trigger lack rings; Sheet close uses `focus:`.
7. DataTable: header-as-key, `min-w-[720px]` forces scroll 768–1100px, no aria-sort.
8. Dead code: Skeleton, VeluraGlassCard, ProgressRow; `TabLink` referenced in a comment but nonexistent.
9. `bg-white` hardcoded in Sheet/GridCard/Bento/menus (theme-swap hostile).
10. GlobalSearch a11y: `aria-controls` target unroled, no `aria-activedescendant`.
11. StatusPill unknown-status fallback silently greys — masking missing mappings.
12. NavigationMenu v4-only classes are no-ops on this v3.4 project.

## 5. Marketing system (from source)

*Extracted from `Reference/Velura/app/(marketing)` + `components/marketing/` — refs relative to `Reference/Velura/`.*

### 5.1 Global frame

Every marketing route renders inside **`MarketingShell`** (`components/marketing/marketing-shell.tsx`): `marketing-font min-h-screen text-slate-950` + `MarketingHeader` + shared footer. Shell background by variant/tone: `immersive-hero` → none (hero supplies its own), `warm` → `hero-mesh`, default → **`bg-[#f8faf9]`** (the bespoke off-white canvas).

**Header** (`marketing-header.tsx`): `<header>` `sticky top-0 z-50 animate-fade-down backdrop-blur-xl`; normal mode `border-b border-emerald-100/80 bg-white/95 … shadow-[0_1px_0_rgba(16,185,129,0.04)]`; overlay mode (immersive-hero pages) `border-white/50 bg-white/75 …`. Bar `mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6`. Desktop mega-menu via `NavigationMenu` (panel widths `md:w-[56rem]` / `md:w-[42rem]`; card grids + compact column); skeleton placeholder until mounted (hydration). Right cluster: `Open workspace` ghost pill `rounded-xl border-emerald-200/80 bg-white/80 px-4 py-2 text-sm font-medium` + **`Book a demo` `rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 hover:shadow-[0_4px_20px_rgba(6,95,70,0.25)]`** — both plain `<Link>`s, not the Button component. Mobile: `SheetContent w-full … bg-white/95 backdrop-blur-lg sm:max-w-sm` + Accordion nav + bottom CTAs `h-10 rounded-xl`.

**Footer** (embedded in the shell, `marketing-shell.tsx:27-62`): `<footer>` `border-t border-emerald-100/60 bg-white`; grid `max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`; brand cell with logo + blurb `text-sm text-slate-500`; column titles `text-sm font-semibold text-slate-950`, links `grid gap-2 text-sm text-slate-500 hover:text-emerald-700`; 5 link columns (Product/Solutions/Resources/Compare/Support); bottom bar `border-t border-emerald-100/60 py-5 text-sm text-slate-400` with © and Privacy/Terms/Cookies.

### 5.2 Route inventory (≈30 marketing routes)

| Group | Routes | Template |
|---|---|---|
| Home | `/` | bespoke flagship (see 5.3) |
| Pricing | `/pricing` | hero + 3 plan cards + calculator (native range styled by `.pricing-calculator-range`) |
| Platform | `/platform` hub + `/platform/{ai-search-analytics, pages, actions, sheets, workflows, superblocks, cowork, integrations, brand-kit, mcp}` | hub grid + `PlatformFeature` template (12 thin routes) or own shell (showcases) |
| Solutions | `/solutions` hub + `{content-refresh, content-engineering, programmatic-seo, teams, enterprises, offsite}` | hub grid + bespoke/template pages |
| Resources | `/resources` hub + `{case-studies, research, workshops}` | hub grid + subpage layout (QuickLinkPills, ResourceLinkCard) |
| Blog | `/blog` + `/blog/[slug]` (+ per-slug generated OG route) | list + article (reading progress bar, sticky TOC) |
| Compare | `/compare/[slug]` | bespoke compare template (feature table) |
| Company | `/about` (tone=warm), `/book-a-demo`, `/support`, `/privacy`, `/terms`, `/cookies` (legal all tone=warm) | shared hero/CTA primitives |

### 5.3 Home page — section by section (`components/marketing/marketing-home.tsx`)

Order: Hero → TrustedMarquee → Platform → Solutions → HowItWorks → Insights → FAQ → CTA. Lazy sections `ssr:true` except InsightsCarousel (`ssr:false`). Mobile-only react-bits `Dock` below `lg` scrolls to section ids.

| Section | Layout | Background | Type | CTA | Motion |
|---|---|---|---|---|---|
| **Hero** | `relative z-10 flex min-h-[100svh] flex-col overflow-hidden`, centered, header spacer `h-[68px] sm:h-[72px]` | `MARKETING_HERO_BG` cover image + `hero-sky-tint` + 3 blurred orbs (`emerald-300/30`, `teal-200/25`, `emerald-400/20`) | H1 `text-[2.15rem] font-normal leading-[1.06] tracking-[-0.03em] … sm:text-5xl lg:text-6xl xl:text-[4.25rem]` (34→68px), **2nd line `text-emerald-800`**; sub `text-base leading-[1.75] text-slate-600 sm:text-lg`; eyebrow pill `text-[11px] uppercase tracking-[0.2em]` + ping dot | Primary `rounded-xl bg-emerald-700 px-6 py-3 text-sm font-medium shadow-[0_4px_24px_rgba(6,95,70,0.28)] hover:bg-emerald-800`; secondary `border-emerald-200/90 bg-white/75 backdrop-blur-sm` + Play icon | `animate-fade-up` staggered `[animation-delay:80–520ms]`; orbs ±14px/8s; dashboard `animate-hero-rise [animation-delay:640ms]` + `hero-dashboard-glow` |
| **Trusted marquee** | `border-b border-emerald-100/80 bg-white pt-10 pb-12`, container `max-w-[100rem]` | white + 18px radial dot grid + `bg-gradient-to-b from-white via-white to-emerald-50/40` | label `text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400`; tiles `text-sm font-medium tracking-tight text-slate-600` | — | `Marquee` rows `--duration:52s/58s` reverse, `pauseOnHover`, grayscale→color on hover |
| **Platform** | `section-below-fold … bg-white py-24 md:py-28 [content-visibility:auto]`; `max-w-7xl` | white + `hero-grid-3d opacity-20` | `SectionHeader` (eyebrow pill + h2 + desc) | — | `SectionReveal`/`RevealItem` + `PlatformModesShowcase` |
| **Solutions** | `bg-white py-20 md:py-24` | white + `solutions-section-bg` + `solutions-dot-grid opacity-[0.35]` | inline header: pill eyebrow emerald-700, h2 `text-3xl … lg:text-[2.75rem] lg:leading-[1.08]`, body `sm:text-lg sm:leading-8` | — | `RevealItem` + `SolutionsBentoGrid` |
| **How it works** | desktop: tall section + `sticky top-20 h-[calc(100dvh-5rem)]`; mobile: simple cards | white | step chips `text-[10px] uppercase tracking-[0.22em] text-emerald-600`; mobile card h3 `text-2xl` | — | scroll-scrubbed `StackingCardViewport` (1:1 via `useScroll`, no spring) |
| **Insights** | `bg-[#040d0a] py-12 md:py-16` | near-black emerald + 4 radial washes + grid `opacity-[0.14]` + **mouse-follow spotlight** `radial-gradient(700px … rgba(16,185,129,0.16))` + 2 animated orbs | h2 white `text-3xl … lg:text-[2.75rem]`; description `text-sm text-emerald-100/65`; eyebrow `text-[10px] tracking-[0.22em] text-emerald-300/90` in pulsing pill | — | full-bleed reverse `Marquee --duration:50s`, edge fades from `#040d0a` |
| **FAQ** | `bg-white py-24 md:py-28`; `max-w-3xl` | white | question `text-base font-semibold text-slate-950 sm:text-lg`; answer `text-sm leading-7 text-slate-600` | — | `GlassCard` per item; accordion height `0.35s ease [0.22,1,0.36,1]`; Plus/Minus swap |
| **CTA** | `py-24 md:py-28` | **`bg-[#071612]`** + `LokiWaveVisualizer` + 2 orbs | card `glass-3d-dark rounded-3xl p-10 sm:p-14`; h2 `text-3xl sm:text-4xl text-white`; body `text-emerald-100/70`; trust labels `text-xs text-emerald-200/60` | Primary **`bg-emerald-500 text-emerald-950 hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.35)]`**; secondary `border-white/15` ghost | entrance y:20 inView once; hover glow |

**Shared reveal primitives** (`home/section-reveal.tsx`): `SectionReveal`/`RevealItem` — `opacity 0→1, y 20→0`, `0.5s`, ease `[0.22,1,0.36,1]`, stagger 0.1, viewport `once, margin:-80px`; eyebrow pill with `animate-glow-pulse` dot. `GlassCard` (`home/glass-card.tsx`): tilt ±14°, z-lift 18px (springs 280/24, 320/26), cursor glare; base `glass-3d glass-shine group relative rounded-2xl transition-shadow duration-500`; glow variant `green-glow hover:shadow-[0_8px_40px_rgba(16,185,129,0.18)]`.

### 5.4 Reusable page templates

- **`MarketingPageHero`** (`marketing-page-hero.tsx`): `py-16` + `max-w-7xl lg:grid-cols-2`; badge pill `text-xs font-medium text-emerald-800`; **h1 `text-4xl sm:text-5xl lg:text-[3.25rem] lg:leading-[1.06]` font-semibold**; lead `text-base leading-7 sm:text-lg sm:leading-8`; primary/secondary CTAs.
- **`PlatformFeature`** — the canonical product page (12 routes): hero `hero-mesh border-b border-emerald-100/70` + WebGL `PixelBlast` (`#059669`) masked off the copy column (`radial-gradient(ellipse 30% 60% at 26% 50%, transparent … #000 84%)`, opacity .8) → metrics band `bg-white py-12 md:py-14` (`sm:grid-cols-2 xl:grid-cols-4`, value `text-3xl font-semibold text-emerald-900`) → optional `emerald-950` band (`workflow-dark-grid opacity-35`; `TextPressure` giant "AI VISIBILITY" `#a7f3d0`) → capabilities marquee (`marquee-x` 38s; cards `h-[184px] w-[300px] sm:w-[330px]`, hover translate-y, icon-underline `w-9→w-12`) → how-it-works (`bg-gradient-to-b from-emerald-50/30 to-white`, 4 step cards `rounded-2xl border-emerald-100 bg-[#f8faf9] p-6 hover:border-emerald-300`, step number `font-mono text-xs tracking-[0.18em] text-emerald-600`, `whileHover y:-6`) → use cases (ai-search variant: framed grid `rounded-3xl p-1 ring-1 ring-emerald-900/10`; cards with dark emerald-950 right rail + signal metric `text-3xl text-emerald-200`; hover `-translate-y-[11px] rotate-[-1.5deg]`) → shared `CtaSection`.
- **Showcases** (pages/actions/sheets/workflows): own hero skeleton `hero-mesh pb-20 pt-16 md:pb-24 md:pt-20` + `hero-grid-3d`; signature extras: `VariableProximity` weight-shift h1 (pages/sheets), `Iridescence`/`Silk`/`Grainient` shader hero backgrounds (pages/actions/sheets), `ScrollExpansionHero` (sheets), `LightRays` + hand-drawn `motion.path` underline (workflows). Bands alternate white / `bg-[#f8faf9]` / `bg-emerald-950` / `#071612` with `py-20 md:py-28` type rhythm; framed mockups `rounded-[2rem] shadow-[0_28px_80px_rgba(6,78,59,0.08)]`.
- **Solutions hub/content-refresh** alternate a **warm** ground: `bg-[#F6F4F1]` / `bg-[#fafdfb]` bands (metrics, steps, use cases) — plus a `bg-slate-950` stats band with two counter-scrolling marquees (chips `border-emerald-800/40 bg-emerald-950/30 text-emerald-300`) in content-refresh.
- **Compare page**: hero (`hero-mesh`) with competitor logo row + h1 `lg:text-[3.1rem]`; proof cards `bg-[#f8faf9] py-12`; punchline callout `rounded-2xl border-emerald-100 bg-emerald-50/60`; feature table `rounded-2xl border-emerald-100 shadow-[0_8px_30px_rgba(15,23,42,0.04)]`, Velura column `bg-emerald-50`, cell pills `bg-emerald-100 text-emerald-800` / `bg-slate-100 text-slate-600`.
- **Blog**: hero eyebrow pill + h1 `text-[2.35rem] … lg:text-[3.25rem]` (list); article has reading-progress bar, `WarpShaderBackground` (reduceMotion-gated), body `bg-[#f8faf9] pb-20 pt-14`, sticky TOC `sticky top-28`.
- **Legal** (`LegalPageLayout`, all three routes): `mx-auto max-w-3xl px-4 py-16 lg:py-20`; eyebrow `text-sm uppercase tracking-[0.24em] text-slate-500`; h1 `text-4xl md:text-5xl`; 15px body; h2 `text-xl` with emerald hairline; h3 `text-sm uppercase tracking-[0.14em] text-emerald-800/90`; lists `rounded-xl border-slate-200/80 bg-slate-50/60 p-5` with emerald bullet dots.
- **Book-a-demo**: standard hero + form (firstName/lastName/workEmail/companyName/phone/questions + honeypot) with success/error states via `useTransition`.

### 5.5 Real-world type scale (as shipped)

| Role | Classes | Effective | Weight/leading/tracking |
|---|---|---|---|
| Home display H1 | `text-[2.15rem] … sm:text-5xl lg:text-6xl xl:text-[4.25rem]` | 34→**68px** | **400**, `leading-[1.06]`, `tracking-[-0.03em]` |
| Page H1 (hero template) | `text-4xl sm:text-5xl lg:text-[3.25rem]` | 37→52px | 600, `tracking-tight`, `lg:leading-[1.06]` |
| Product H1 | `text-4xl sm:text-5xl lg:text-[3.1rem] lg:leading-[1.06]` | 37→49.6px | 600 |
| Workflows H1 | `text-4xl … lg:text-[4rem]` | 37→64px | 400, `leading-[1.14]` |
| Section H2 (canonical) | `text-3xl sm:text-4xl lg:text-[2.75rem] lg:leading-[1.08]` | 31→44px | 600, `tracking-tight` |
| Body lead | `text-base leading-7 sm:text-lg sm:leading-8` | 17→19px | 400 |
| Body/card copy | `text-sm leading-7` | **16px** (their sm) | 400 |
| Eyebrow pill | `text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700` | 11px | 600 |
| Micro-label | `text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600/90` | 10px | 600 |
| Metric value | `text-3xl font-semibold tracking-tight text-emerald-900` | 31px | 600 |

### 5.6 Spacing rhythm (as shipped)

| Context | Padding | 
|---|---|
| Flagship home sections | `py-24 md:py-28` |
| Editorial hero-scale sections | `py-20 md:py-28` |
| Hub/product sections | `py-16 md:py-20` |
| List/grid subpages | `py-14 md:py-20` |
| Metric bands | `py-12 md:py-14` (product) · `py-8` (showcases) |
| Container | `mx-auto max-w-7xl px-4 md:px-6` (dominant); narrower `max-w-3xl` (FAQ/legal/intro), `max-w-4xl` (CTA), `max-w-5xl` (compare/support), `max-w-[100rem]` (marquee) |
| Grid gaps | `gap-3` metrics · `gap-4` product metrics · `gap-5` feature cards · `gap-8` footer · `gap-12` hero 2-col |
| Card padding | `p-5` (chip cards) · `p-6`/`p-6 sm:p-7` (feature cards) · `p-10 sm:p-14` (CTA panel) |

### 5.7 Motion inventory (marketing)

- **CSS:** `animate-fade-up` (0.9s blur+rise), `fade-down`, `hero-rise` (1.1s), `glow-pulse` (4s eyebrow dots), `blur-rise-*`, workflow dots/rails, `workflow-marquee` (32s), `blog-marquee` (45s), `marquee-x/-reverse` (38/44s), `marquee-y` (22/26s), `integration-flow-line` (1.2s dash), `animate-grow-x`, `animate-float`, border-rotate/beam families — all reduced-motion-gated class by class.
- **Framer (`motion/react`):** `SectionReveal`/`RevealItem` (y20/0.5s, stagger 0.1, `once, margin:-80px`); `GlassCard` tilt springs; hero orbs ±14px/8s; mouse-follow spotlight (`useMotionTemplate`); scroll-scrubbed stacking cards (1:1, no spring); accordions `0.28–0.35s [0.22,1,0.36,1]`; product-page word reveal (blur 7px, stagger 0.055); hover nudges (`y:-6`, `-translate-y-[11px] rotate-[-1.5deg]`).
- **WebGL discipline (copy this pattern):** all shader/canvas heroes (PixelBlast, Silk, Iridescence, Grainient, LightRays, WarpShader) are client-only dynamic imports, `requestIdleCallback`-deferred (+250ms fallback), `prefers-reduced-motion`-gated, and **geometrically masked away from the copy column**.
- **Mobile parity:** desktop pinned/stacked interactions are replaced by simple tab cards below `lg`; a react-bits `Dock` launcher appears only below `lg`.
- **Perf hints as tokens:** `section-below-fold`, `[content-visibility:auto] [contain-intrinsic-size:auto_900px]`, tall `lg:h-[200vh]/[250vh]` scroll ranges instead of JS scroll-jacking.

### 5.8 Marketing quirks (feed §8)

1. Duplicate hero implementations (home vs pricing near-copies, including a duplicated `HeroOrb`); header CTAs are ad-hoc links rather than the Button component.
2. Two headers coexist: marketing `h-16 z-50` overlay variant vs product `site-header h-14 z-40`.
3. Footer lives inside the shell (not a component).
4. **Theme temperature mix:** cool `#f8faf9` default, warm `#F6F4F1`/`#fafdfb` bands, near-black greens `#040d0a` / `#071612` / emerald-950 / slate-950, card interiors `#041912`.
5. Radius flattening compensated by `rounded-full` pills and arbitrary values (`[22px]`, `[2rem]`).
6. Unused component graveyard: `blog-hero-cinema-stage`, `blog-hero-featured-panel`, `blog-hero-marquee`, `blog-hero-flow-field`, `hero-spline-visual`, `resources-section`, `lottie-icon`, `blog-carousel`, entire `questly/*` set.
7. `questly` font family + components = dead brand remnant (Slate→Velura rebrand residue).
8. Legal pages intentionally `tone="warm"` (hero-mesh) — softening legal.
9. Shell mounting is inconsistent: route file wraps for hubs, component self-mounts for showcases/support.
10. Focus/ping/pulse micro-details: eyebrow dots use CSS ping/pulse rather than JS.

## 6. Product app system (from source)

*Extracted directly from `Reference/Velura/app/(application)/workspace`, `app/(auth)`, `app/(onboarding)` and app-side `components/`. §4 covers the primitives themselves; this section covers how they compose into screens.*

### 6.1 Shell blueprint (`app/(application)/workspace/layout.tsx`)

| Layer | Exact classes / values |
|---|---|
| Root | `h-screen overflow-hidden bg-slate-50/40` |
| Header | `SiteHeader` — 56px bar (`h-14`), sticky, `bg-white/85 backdrop-blur-xl`, border-b `slate-200/70`; brand column `lg:w-60` matching the sidebar divider |
| Body row | `flex h-[calc(100vh-3.5rem)] w-full overflow-hidden` |
| Sidebar | `AppSidebar` — **240px** (`w-60`), white, `border-r border-slate-200/70`, `px-3 py-3`, desktop-only (`lg:flex`); mobile = Sheet drawer |
| Main scroller | `h-full min-w-0 flex-1 overflow-y-auto` + **emerald wash** `bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(16,185,129,0.04),transparent_60%)]` + `p-4 sm:p-5 lg:p-6` (16/20/24px) |
| Content width | `PageContainer` `mx-auto w-full max-w-[1700px]`; `narrow` = `max-w-3xl`; `wide` = none |
| Theme | light only — no `.dark`, no toggle |

### 6.2 Navigation architecture

Sidebar sections (`SidebarNav`): **Workspace** — Overview (`/workspace/dashboard`), AI Search, Actions, Pages, Keywords, AI Readiness, Workflows, Sheets · **Agents** — Cowork, Recipes, Brand Kit, Agent Settings (with collapsible "Agent Studio") · **Library** — Files · **bottom** — Workspace Settings / Organization. Rows are 36px / 13px text, active = `bg-emerald-50 text-emerald-700` + 3×16px indicator bar; icons 17px (sub 15px), `strokeWidth 2.2` when active. Header carries the global search combobox, help icon, Brand Kit shortcut, workspace switcher and mobile nav trigger.

### 6.3 Canonical module-page recipe (the pattern every workspace screen follows)

```
PageContainer
└─ div.space-y-6
   ├─ <Reveal> PageHeader
   │   eyebrow (11px, emerald-700, uppercase, 0.18em) · 36px emerald icon tile
   │   <h1> text-2xl (25px) font-semibold tracking-tight text-slate-900 · desc max-w-2xl
   │   actions: Button size="sm" (+ AnalystChat / secondary outline)
   ├─ <Reveal delay={60}> KPI grid: grid gap-5 md:grid-cols-2 xl:grid-cols-4 (MetricCard/StatCard)
   └─ <Reveal delay={120}> content grids
       Card → CardHeader (title text-base 19px + description 16px muted)
            → CardContent (space-y-3/4)
              toolbar: Input h-9 pl-9 + native Select h-9 w-32–44 + Button size="sm"
              DataTable (desktop ≥768) / stacked mobile cards
              "Load more" → full-width outline Button
```
Evidence: dashboard, keywords, ai-search, prompts, history. Cards use `Card` (8px radius, slate-200/70 hairline, green-tinted soft shadow) with **20px padding on KPI cards, 24px on standard cards, 16px on bento-style**.

### 6.4 Dashboard composition (exact, `dashboard/page.tsx`)

- **Header:** eyebrow "Workspace", icon `Gauge`, title "Overview", description "What needs attention across {workspace} today."; actions = `AnalystChat` + primary `New workflow` (`size="sm"`, icon `h-4 w-4`).
- **KPI row:** 4 `MetricCard`s, `grid gap-5 md:grid-cols-2 xl:grid-cols-4`, Reveal delay 60.
- **Main grid:** `grid gap-6 xl:grid-cols-[1.45fr_0.55fr]`, Reveal delay 120.
  - **Action queue** Card: header row with `CardTitle text-base` + count pill (`rounded-full border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700`) → `DataTable` (Action / Priority / Updated / Status) or dashed empty state (`rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12`, 28px slate-300 icon).
  - **Right stack** `space-y-6`: **Module health** Card (header count pill `bg-slate-100 text-slate-600`; rows `flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-slate-50`, 8px status dot + name/detail + `StatusBadge`), **Recent activity** Card (timeline rail via `before:` 1px slate-200; 11px emerald dot `border-2 border-white ring-1 ring-emerald-200`; event 14px medium + time 14px slate-400 + detail 14px slate-500).
- **Priority pills:** `bg-rose-50/amber-50/slate-100` + `text-*-700` + `ring-1 ring-inset ring-*-100`, `rounded-full px-2 py-0.5 text-xs font-medium`.

### 6.5 Module inventory (38 workspace routes)

| Module | Routes | Notable surfaces / composition |
|---|---|---|
| Dashboard | `dashboard` | Above |
| AI Search | `ai-search` + `setup`, `analyst`, `citations`, `sentiment`, `prompts`, `search-terms`, `history` | API-driven client pages: StatCard KPI grid, period + platform filters, run status/progress (polling), `StatusPill`, `AppLoader`; sub-pages use toolbar + DataTable; Analyst = chat surface |
| Keywords | `keywords` | KPI grid → `grid gap-6 xl:grid-cols-[0.75fr_1.25fr]`: **Rank distribution** Card (CSS bars `h-2 rounded-full bg-slate-100` + `bg-emerald-500` fill) + **Tracked keywords** Card with inline search (`h-9 pl-9`), three native Selects (`h-9 w-32–40`), DataTable, CSV import (outline `sm`) + Add (filled `sm`); `EmptyState` card when empty |
| Pages | `pages` | Tabs + `ContentPerformance`: mini KPI cards `rounded-xl border-slate-200/70 p-4` (12px uppercase labels, `text-2xl font-semibold`), hand-built **WeeklyBars** charts (series `bg-emerald-600` published / `bg-amber-400` refreshed / `bg-slate-500` clicks), segmented filter `inline-flex rounded-lg bg-slate-100 p-0.5 text-xs` (active `bg-white text-emerald-700 shadow-sm`), dashed empty state |
| Actions | `actions`, `actions/[actionId]`, `actions/briefs/[briefId]` | Action queue/detail + briefs (markdown renderer for generated briefs) |
| Workflows | `workflows`, `create-workflow`, `[workflowId]/edit`, `[workflowId]/runs`, `runs/[runId]` | React Flow canvas (`@xyflow/react`, custom thread edges; edges z-8 / nodes z-12; dark grid classes), run lists + run detail |
| Sheets | `sheets`, `create-sheet`, `sheets/[sheetId]` | Spreadsheet workspace (dense grid), create page uses the PageHeader eyebrow/title recipe, cell-run side drawer (`Sheet side="right"` with emerald-tinted header/footer) |
| Agents | `agents`, `agents/recipes`, `agents/cowork`, `agents/settings/{models,memory,skills,slack,history}` | Cowork = chat workspace; Recipes = editor; Settings forms = `FormField` + `FancySelect` + `Input`; destructive actions = outline rose buttons |
| Brand Kit | `brandkit` | Structured brand form (voice, facts, competitors) — plain Cards + FormField |
| Files / llms.txt | `files`, `llms-txt` | Lists + custom `Tabs` segmented control |
| Settings | `settings`, `settings/organization` | Members/invites/roles; destructive confirm = native `Dialog` with hand-painted rose button |

### 6.6 In-app data visualisation (no chart library)

**No recharts/chart lib is installed** — every chart is hand-built:
- **Progress/rank bars:** `h-2 overflow-hidden rounded-full bg-slate-100` + fill `bg-emerald-500` (`KeywordsWorkspace.tsx:380-382`).
- **Weekly bar charts:** div-based columns, series colors `bg-emerald-600`, `bg-amber-400`, `bg-slate-500` (`ContentPerformance.tsx:232-243`).
- **Sparklines/curves:** inline `<svg viewBox>` paths with `preserveAspectRatio="none"`, emerald strokes (2.5px) and `stroke-dasharray/dashoffset` hover draw (`platform-feature.tsx:75, 151, 183`; marketing-side but the same technique).
- **Deltas:** `Delta` component — `tabular-nums`, `text-emerald-600` good / `text-rose-600` bad / `text-slate-500` flat, with 12px arrow icons (`components/ai-search/shared.tsx:157-180`).
- **Chart palette = status tones** (emerald / amber / rose / sky / violet / slate) with slate used for neutral series; no `--chart-*` tokens exist.

### 6.7 Auth & onboarding

**Login** (`app/(auth)/login/page.tsx`): full-screen gradient `radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_32%), linear-gradient(135deg,#f8fafc,#eef2f7_45%,#fff7ed)`; centered `max-w-5xl` two-pane card `rounded-lg border-white/70 bg-white/70 shadow-2xl shadow-slate-950/10 backdrop-blur-xl md:grid-cols-[1.05fr_0.95fr]` (min-height 520px); left = brand (wordmark `uppercase tracking-[0.22em] text-primary`), h1 `text-4xl sm:text-5xl font-semibold leading-tight`, body, Google sign-in `Button h-12 w-full text-base` inside a `rounded-lg border-slate-200 bg-white/75 p-2` frame, error `text-rose-600`; right = **dark slate-950 panel** with `text-xs uppercase tracking-[0.2em] text-teal-200` label and white/10 tiles — the only dark in-product surface outside code blocks. Invite route uses the same auth layout.

**Onboarding** (`app/(onboarding)/workspace/onboarding/page.tsx`): deliberately **outside** the app layout (so the workspace shell doesn't wrap it); `min-h-screen bg-slate-50/60 px-4 py-8 sm:py-14`; `mx-auto max-w-xl space-y-6`; brand row + 12px "Sign out" text button; h1 `text-2xl sm:text-3xl font-semibold tracking-tight`; body 14px; Cards for pending invitations and workspace creation.

### 6.8 In-app type, density & rhythm

| Element | Value |
|---|---|
| Sidebar rows | 36px tall, 13px label, 10px section caps `tracking-[0.16em]` |
| Header | 56px; search max-w-md; 9px icon buttons (`h-9 w-9`) |
| Table rows | header ≈46px (`px-4 py-3`, 14px uppercase caps), body ≈50px (`px-4 py-3`, 16px text) |
| Page title | 25px semibold; card title 19px; KPI label 11px caps; KPI value 25px (`text-2xl`) or 28px (`text-[28px]`) |
| Body copy | 16px (`text-sm` in this scale) / 26px; secondary 14px (`text-xs`); micro-labels 9–11px |
| Card padding | 24px standard, 20px KPI, 16px bento/mobile |
| Gaps | KPI grid 20px, content grid 20–24px, stacks 24px; page padding 16/20/24px responsive |
| Entrances | `Reveal` fade-up stagger 0/60/120ms; cards hover lift −2px/300ms |
| Overall density | **airy enterprise** — roomier than typical dense SaaS (50px rows, 20–24px card padding, generous whitespace) despite the design doctrine asking for "compact" density |

### 6.9 Product-app quirks (feed §8)

1. Two status systems in production (`ui/status-pill.tsx` canonical vs `components/status-badge.tsx` legacy) — they disagree on `queued` (slate→sky) and `running` (amber→violet), and differ in radius/weight.
2. Dashboard mixes `MetricCard` + `StatusBadge`; AI Search uses `StatCard` + `StatusPill` — two KPI/status dialects side by side.
3. Charts are hand-rolled per page (divs/SVG), with hard-coded series colors; no shared chart primitives or tokens.
4. Auth is the only place using heavy elevation (`shadow-2xl` + `backdrop-blur-xl`) and a dark panel; the rest of the app is flat/hairline.
5. Empty states come in two flavors: the `EmptyState` component and inline dashed-border boxes.
6. The `Toolbar` component exists but most pages compose their own inline search/filter rows.
7. Several AI Search screens are fully client-side with polling; others are server components — inconsistent data-loading ergonomics (visual impact limited to loaders/progress).
8. `bg-white` is hard-coded across surfaces — the app would not theme without a sweep.
9. Onboarding intentionally bypasses the shell; auth uses a separate gradient world — three visual contexts (marketing / auth / app) rather than one continuous system.
10. The app's light, roomy density sits in tension with its own written doctrine ("compact, dense operational UI") — the primitives are compact (36px nav rows, 46–50px table rows) while the page rhythm is generous (20–24px gaps).

## 7. Effects & brand (from source)

*Extracted from `Reference/Velura/` — refs relative to that directory. Legend: **used** = imported and rendered; **dead** = defined but never imported (grep-verified).*

### 7.1 Effect inventory — react-bits ports (`components/react-bits/`)

| Component | Effect / tech | Key params at call sites (the real spec) | Status |
|---|---|---|---|
| `Dock` | macOS magnifying dock (spring springs) | Mobile-only (`block lg:hidden`): panelHeight 66, baseItemSize 50, magnification 68, 5 lucide items 18px | **used** (`marketing-home.tsx`) |
| `ScrollFloat` | Per-char scroll-scrubbed rise (GSAP + ScrollTrigger, scrub 0.55, `back.out(1.7)`, stagger 0.018) | Used on 6 call sites (platform-feature, workflows, sheets, pages, actions ×2) | **used** |
| `TrueFocus` | Blur + animated bracket focus frame | Workflows solution toggle: manualMode, activeIndex, blur 3.5, border `#059669`/`#f43f5e`, glow `rgba(16,185,129,.4)`/`rgba(244,63,94,.28)`, dur 0.38 | **used** |
| `VariableProximity` | Per-letter variable-font weight/optical-size tracking cursor | Sheets/pages H1s: `'wght' 560, 'opsz' 42` → `'wght' 850, 'opsz' 72`, radius 120–125, gaussian | **used** |
| `TextPressure` | Letters widen/bolden near cursor (Roboto Flex) | Platform AI-search band: "AI VISIBILITY", textColor `#a7f3d0`, minFontSize 30, `h-24 sm:h-32 lg:h-40` | **used** |
| `Silk` | Flowing silk shader (three.js) | Actions hero: speed 3.4, scale 1.1, color `#34d399`, rotation 0.32; dynamic import ssr:false | **used** |
| `PixelBlast` | Pixel-grid field (WebGL) | Platform hero: color `#059669`, pixelSize 5, patternScale 2.6, density 1.3, jitter 0.5, speed 0.5, edgeFade 0.04; masked `ellipse 30% 60% at 26% 50%` off the copy column | **used** |
| `Iridescence` | Iridescent shader (three.js) | Pages hero + band: color `[0.26,0.82,0.6]` (brand emerald), speed 0.6, mouseReact false | **used** |
| `Grainient` | Grainy warped gradient (ogl/WebGL2) | Sheets hero: colors `#ecfdf5/#6ee7b7/#34d399`, grain 0.085, contrast 1.12, warp 64/4.0/1.1, rotation 240 | **used** |
| `LightRays` | Volumetric god-rays (WebGL) | **DEAD** — repo also has a live `components/ui/light-rays.tsx` variant (below) | dead |
| `RotatingText`, `ShinyText`, `LineWaves`, `BlurText` | word-swap spring / shimmer sweep / ridge-line flow field (ogl) / blur-rise | dead (BlurText only re-exported by a dead barrel) | dead |

### 7.2 Effect inventory — in-house (`components/ui/`)

| Component | Effect / tech | Call-site params | Status |
|---|---|---|---|
| `light-rays` (in-house) | Brand-green volumetric rays (raw WebGL) | Workflows hero: raysColor `#10b981`, spread 0.85, length 1.6, followMouse, noise 0.05, distortion 0.04, `opacity-[0.8]` | **used** |
| `ShaderBackground` | Plasma-line field, deep forest greens + particles (raw WebGL) | Workflows dark CTA: `-z-20 opacity-75`; constants speed 0.16, 16 lines; colors `vec3(0.015,0.17,0.12)` → `vec3(0.08,0.58,0.38)` | **used** |
| `WarpShaderBackground` | Marbled emerald warp (`@paper-design/shaders-react`) | Blog article hero: colors `hsl(165,88%,7%) / hsl(162,84%,30%) / hsl(174,70%,36%) / hsl(154,76%,72%)`, swirl 0.85, shape "checks"; base `#03130d`; gated by reduceMotion | **used** |
| `GooeyText` | Gooey SVG-filter text morph | Pages showcase: morph 0.7 / cooldown 0.9, `text-emerald-800` | **used** |
| `VerticalTiles` | Tile-wipe content reveal | Sheets showcase: `bg-emerald-950` tiles, minTileWidth 38, `rounded-3xl` | **used** |
| `ScrollExpansionHero` | 24vw×20vh panel grows to 80vw×78vh, headline splits (`useScroll`) | Sheets: section `h-[200vh]`, bg `#071612`, sticky top-16, radius 32→0, titles slide ±420px; reduced-motion fallbacks | **used** |
| `CreditCard` | 3D tilt + flip card with sheen | Pricing hero: gradient `#1f8f6a→#1a6b52→#0f4a38→#062a1f`, tilt ±6°, `h-[13.5rem] w-[21.5rem]`, planTier "PRO" | **used** |
| `SplineScene` (`splite.tsx`) | 3D Loki robot hero (Spline), `renderOnDemand`, pauses off-screen | Hero fallback path; recolored by name-regex heuristic (`lib/spline-robot-controller.ts` — joints `#1a6b52`/`#0f4a38`/`#248f6a`, visor `#0c1210`, bg `#062a1f`) | **used** (alt hero) |
| `Marquee` | CSS infinite marquee (reverse, pauseOnHover, `--duration`/`--gap` vars) | trusted-marquee (52/58s), insights (50s), content-refresh stats (55s/40s) | **used** |
| `GlowCard` (`spotlight-card.tsx`) | Pointer-tracked radial spotlight border + halo + shine | Case-studies featured card: greens emerald-700/500/300 ladder, spotlight stops 0–62%, shine 420px, shell `p-[2px] rounded-[1.25rem]` | **used** |
| `RevealCardContainer` (in `animated-profile-card.tsx`) | GSAP clip-path circular reveal on hover (expo.inOut 0.75s open / expo.out(1,1) 0.9s close) | Blog grid, marketing feature cards, case-study cards, resource cards | **used** |
| `LokiWaveVisualizer` | Canvas-2D glowing wave bands | Home dark CTA backdrop: 8 bands, emerald-tinted strokes, glow `rgba(36,143,106,…)`, dpr ≤ 2 | **used** |
| `HeroDitheringCard` | Dithered warp gradient hero card (`@paper-design/shaders-react` Dithering) | Workshops hero: colors `#ecfdf5/#34d399`, shape "warp", speed 0.2→0.42 hover, `opacity-60` | **used** |
| `StackingCardViewport` | Scroll-driven stacked card deck | Home how-it-works: segment 900px, peek 42px, card height 372px | **used** |
| `wave-text` (`Text_03`) | Hover wave across characters (framer-motion, not motion/react) | Sheets/pages/actions: y −4, scale 1.2, delay i×0.03 | **used** |
| `variable-font-hover-by-random-letter` | Hover scrambles variable-font weight in seeded shuffled order | Pages/actions: `'wght' 400 → 750`, spring 0.7s, stagger 0.025 | **used** |
| Dead set | `Spotlight`, `BorderRotate` (rotating conic border, greens `#1a6b52/#248f6a/#34d399`), `PixelCanvas` (palettes `["#064e3b","#248f6a","#10b981","#6ee7b7"]`), `CaseStudies3DMarquee`, `RotatingHeadline`, `TextRevealByWord`, `PrismaHero`, `HeroGeometric` (+ its `demo.tsx`) | — | **dead** |

### 7.3 GSAP usage

GSAP appears in exactly **3 files** (despite the motion-heavy site): `ScrollFloat.tsx` (scroll-scrubbed char reveal), `animated-profile-card.tsx` (clip-path reveal), `workflows-showcase.tsx` (one `gsap.set` for mouse parallax, ±20px clamp). Everything else is `motion/react` — with two outlier files still on `framer-motion` (two animation libraries coexist).

### 7.4 Brand spec

- **Logo:** `public/logo.svg` — 64×64 four-lobed quatrefoil/rounded-plus with negative-space 4-point star; radial gradient `#ffffff → #77C469 (45.7%) → #007A55`.
- **Favicons:** full set (ico, 16/32 png, apple-touch, android 192/512) + `site.webmanifest` (theme_color `#007A55`).
- **OG pipeline:** `app/opengraph-image.tsx` + `twitter-image.tsx` (1200×630) → `renderOgImage()`: static `meta-og.png` full-bleed, logo `#007A55` at top-left, title 36px/700 `#0f172a` `-0.02em`. Blog variant: dark `#03130d`, logo `#34d399`, accent bar `#34d399 → #2dd4bf`, title 52px.
- **Identity strings** (`lib/site-config.ts`): `SITE_NAME` "VeluraHQ"; `SITE_TAGLINE` **"Build content workflows. Deploy agents. Run at scale."**; description "…the automation platform for SEO, web, and content teams…".
- **Effect palette (as used):** emerald ladder `#047857 · #059669 · #10b981 · #34d399 · #6ee7b7 · #a7f3d0 · #d1fae5 · #ecfdf5`; deep darks `#007A55 · #03130d · #041912 · #062a1f · #071612 · #0f4a38 · #1a6b52 · #248f6a`; ink `#0f172a`/slate-950; danger accent `#f43f5e` (TrueFocus); **all off-brand shader defaults (purple/amber/pink) are recolored to this ladder at call sites — the call-site props are the spec.**

### 7.5 Repo design doctrine (verbatim — highly relevant to the HRMS comparison)

From `docs/product-context.md` (the product design mandate):

> - "Dense, operational workspace UI rather than a marketing landing page."
> - "Keep UI controls realistic: filters, tabs, tables, buttons with icons, status badges, and compact cards."
> - "**Avoid generic AI-generated "slop" UI. Do not use decorative filler, vague glassmorphism, oversized empty cards, random gradients, fake visual noise, or marketing-style sections that do not help the user do work.**"
> - "Build a traditional, disciplined SaaS workspace UI: predictable navigation, compact information density, clear tables, filters, tabs, forms, status badges, command buttons, and review states."
> - "Prefer familiar enterprise application patterns over trendy AI-product styling. The product should feel like a serious operating system for marketing teams, not a generic AI landing page."
> - "Keep visual hierarchy restrained: no hero-scale typography inside app screens, no decorative orbs, no one-note gradient palettes, no nested cards, and no large empty placeholder surfaces once a route is implemented."

From `docs/developer-context.md`:

> - "Any UI change should be checked across small mobile, large mobile, tablet, laptop, desktop, and wide desktop layouts. Shared components must degrade to a usable stacked layout when horizontal space is constrained, and hover-only interactions should always have a mobile-friendly fallback."

From `docs/velurahq-overview.md` (positioning):

> - "VeluraHQ is the AI-native marketing workspace that measures how your brand wins in Google *and* AI answer engines…"
> - "**Other tools show you the score. VeluraHQ tells you the play, runs it at scale, and proves it worked.**"
> - "…the **operating system for modern content growth** — where AI search visibility, traditional SEO, brand-governed automation, bulk execution, and outcome attribution live in one disciplined workspace."

(Note: `docs/product-context.md:24` still claims a "dark Tailwind theme" — contradicted by every shipped surface; stale.)

### 7.6 Mintlify docs theme (`mintlify/`)

Theme "mint"; colors primary `#047857`, light `#ecfdf5`, dark `#065f46`; lucide icons; light default; primary button "Open workspace"; contextual options copy/view/chatgpt/claude. Logo: 180×40, rounded-square rect 28×28 rx 8 fill `#047857` + white **"M" monogram** + "VeluraHQ" text 18px/600 `#0f172a`; dark variant rect `#34d399`, monogram `#022c22`.

⚠️ The Mintlify "M" monogram is **visually disconnected** from the main site's quatrefoil mark — two brand marks coexist.

### 7.7 Asset inventory (`public/`)

| Asset | Wiring | 
|---|---|
| `images/marketing-hero-bg.webp` | live (hero background via `lib/marketing-hero-assets.ts`) |
| `images/landing-right-side.png`, `images/workflows-calm-hero.png` | **zero references** (orphans) |
| `logos/openai.svg` | live (integration brands) |
| `logos/case-studies/*.svg` (4) | **unreferenced** |
| `lottie/*.json` (3) + `solutions/*.svg` (5) | live (bento content) |
| `workshop/image-removebg-preview.png` | live (raw export filename left as-is) |
| `compare/*.png/.svg` | 4 wired via `lib/compare/assets.ts`; `make.svg`/`n8n.svg` unused |
| `meta-og.png`, `logo.svg`, favicon set, `site.webmanifest`, `llms.txt` | live |

### 7.8 Effects/brand quirks (feed §8)

1. Two brand marks (quatrefoil vs Mintlify "M") and two greens (`#007A55` logo terminal vs `#047857` docs).
2. All shader components ship off-brand default palettes; only the call-site overrides are on-brand — the defaults are a trap for replicas.
3. Dead-component graveyard is large (10+ unused effect components), incl. a duplicate amber `LightRays` next to the live green in-house one.
4. WebGL strategy is explicit and worth copying: dynamic import `ssr:false`, `requestIdleCallback` deferral, off-screen pause, reduced-motion gating, geometric masking away from text.
5. GSAP is peripheral (3 files); the house library is `motion/react` (with legacy `framer-motion` leftovers in 2–3 files).
6. Slate→Velura rebrand residue persists in assets (Webflow CDN images), seeds, and docs; `PROGRESS.md` is stale.
7. OG backgrounds are static bitmaps composited with `ImageResponse`.

## 8. Notable decisions & quirks (consolidated)

*Deduplicated from §2–§7. **Copy** = worth translating into HRMS; **avoid** = do not replicate.*

### 8.1 Deliberate decisions worth copying

1. **Flattened radius scale.** `--radius: 0.5rem`; `rounded-xl/2xl/3xl` all compute to **8px**. Small controls 6px, cards/panels 8px, pills `rounded-full`, 28px reserved for hero-frame panels. Calm geometry, no 12/16/24 ramp.
2. **Light-display / semibold-support type inversion.** Hero `h1` **68px weight 400** tracking −0.03em; section `h2` 44px/600; DM Sans variable (100–1000) as the only family; micro-labels 10–11px uppercase at 0.16–0.22em. Support copy carries the weight.
3. **Two-tone green CTA system.** Filled primary = emerald-700 `#047857`; accent = emerald-500 `#10B981` with dark emerald `#022C22` text. Keeps a bright accent without washing out contrast.
4. **Elevation = hairline + tinted soft shadow.** White surfaces, `border-slate-200/70`, green-tinted shadows (`--shadow-*`). No heavy elevation in marketing or app; the auth screen (`shadow-2xl` + blur) is the deliberate exception.
5. **Section rhythm.** 96 / 112px steps; white dominant, **one** near-black emerald band (`#040D0A`), warm bands `#F6F4F1` / `#fafdfb` used sparingly.
6. **Cards:** white, 8px radius, hairline border, soft shadow; KPI cards keep 20px padding, standard cards 24px.
7. **Effect discipline.** CSS-first motion primitives; WebGL `dynamic(ssr:false)` + `requestIdleCallback` deferral + off-screen pause + reduced-motion gating + geometric masks away from text. House lib `motion/react`; GSAP peripheral.
8. **A written design doctrine** (`docs/product-context.md`): dense operational UI; no AI slop, decorative orbs, hero-scale type in app, or nested cards. Rare and valuable — HRMS should have its own.
9. **The canonical app page recipe.** `PageContainer` (1700px) → `PageHeader` → 4-up KPI grid (`gap-5`) → content grid (`xl:grid-cols-[1.45fr_0.55fr]`) → Card/DataTable, with `Reveal` stagger 0/60/120ms.
10. **Compact primitives.** 56px header, 240px sidebar, 36px nav rows, 46–50px table rows, 36px inputs/small buttons, 13px nav labels.
11. **Semantic status dictionary** (good/bad/neutral tones) rendered as uppercase 10px letterspaced pills; deltas use `tabular-nums`.
12. **Three deliberate visual contexts:** marketing / auth / app. Auth gets a gradient + dark panel; onboarding sits outside the shell at 36rem.
13. **No chart library.** Hand-built bars and SVG sparklines; chart palette borrowed from status tones (emerald / amber / rose / sky / violet / slate).

### 8.2 Internal inconsistencies (do not copy)

1. **Two status systems.** `StatusPill` (canonical) vs `StatusBadge` (legacy) disagree on `queued` (slate→sky) and `running` (amber→violet), and differ in radius/weight. Dashboard mixes MetricCard + StatusBadge; AI Search uses StatCard + StatusPill.
2. **StatCard vs MetricCard drift.** 25px vs 28px value, muted vs `slate-400` label, 40px vs 36px tile, external vs built-in trend.
3. **Token vs shipped CTA.** `--primary` (`#129174`) is used only by Button `default`; marketing CTAs hard-code emerald-700/500 and bypass it; header CTAs are ad-hoc links, not Buttons.
4. **Radius decisions leak to call sites.** Arbitrary `[22px]` / `[2rem]` and full pills compensate for the flattened scale.
5. **Three border conventions** (`slate-200/70`, `slate-200`, `emerald-100`) plus `border-border`; no documented rule.
6. **Dialog ≠ Sheet.** Native dialog vs Radix sheet, different scrims (50% no blur vs 40% + blur), chrome, radii, and focus behavior. No destructive/link Button variant; `--destructive` is never used.
7. **Two headers + mounting drift.** Marketing header 64px `z-50` overlay vs product header 56px `z-40`; footer lives inside the marketing shell; some routes wrap the shell, some components self-mount.
8. **Temperature mix.** Cool `#f8faf9` default + warm bands + near-black greens; card interiors `#041912`. Brand has two greens (`#007A55` logo terminal vs `#047857` CTAs) and two marks (quatrefoil vs Mintlify “M”).
9. **No dark mode in practice.** No `.dark` block and zero `dark:` utilities, yet dark mode is nominally “wired”; `bg-white` is hard-coded across Sheet/GridCard/Bento/menus.
10. **Two empty-state patterns** (`EmptyState` component vs inline dashed boxes); a `Toolbar` primitive exists but most pages hand-compose filter rows.
11. **Density doctrine vs shipped rhythm.** Doctrine says “compact/dense”; pages ship 50px rows, 20–24px gaps and generous whitespace.
12. **Effects defaults are off-brand.** Shader components ship non-Velura palettes; only call-site overrides are on-brand. Duplicate `LightRays` (amber next to live green) and duplicate hero implementations (home vs pricing).
13. **Charts are per-page.** Hard-coded series colors, no shared primitives or `--chart-*` tokens.
14. **Loading/data ergonomics differ** — some AI Search screens are fully client-side with polling, others are server components.

### 8.3 Dead code / rebrand residue

- Dead UI: `Skeleton`, `VeluraGlassCard`, `ProgressRow`; `TabLink` is referenced in a comment but does not exist.
- Marketing graveyard: `blog-hero-cinema-stage`, `blog-hero-featured-panel`, `blog-hero-marquee`, `blog-hero-flow-field`, `hero-spline-visual`, `resources-section`, `lottie-icon`, `blog-carousel`, the entire `questly/*` set.
- Effects graveyard: 10+ unused effect components, including the duplicate amber `LightRays`.
- Slate→Velura rebrand residue in Webflow CDN assets, seeds, docs, the `questly` font family/components; `PROGRESS.md` stale.

### 8.4 Accessibility & technical debt

- Focus gaps: sidebar rows, Tabs, mobile trigger lack rings; Sheet close uses `focus:` instead of `focus-visible:`.
- DataTable: header-as-key, `min-w-[720px]` forces horizontal scroll between 768–1100px, no `aria-sort`.
- GlobalSearch: `aria-controls` target has no role, no `aria-activedescendant`.
- NavigationMenu uses v4-only classes that are no-ops on this v3.4 project.
- `StatusPill` silently greys unknown statuses, masking missing mappings.

### 8.5 Doctrine vs shipped — the honest read

Velura's great strength is a **single coherent palette, flattened geometry, disciplined typography, and a written doctrine**. Its weakness is **drift**: duplicate status/KPI/table variants, token bypasses, arbitrary radii, and call-site overrides. The system is strongest at the primitive layer and weakest at the composition layer.

For HRMS the safe strategy is therefore: **copy the principles, tokens and recipes — not the file structure or the inconsistencies.** Anything adopted should be re-expressed once, in HRMS's Tailwind v4 `@theme`, with one status system, one KPI card, one toolbar/table recipe, and no parallel variants.
