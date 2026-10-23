# HRMS Design System — Airbnb language

Canonical UI reference for `apps/web`. The PRD defers to this document for look and feel; the PRD still governs behavior, data and API contracts.

> Reconciliation note: this file encodes the canonical Airbnb token set from memory. When the maintainer shares the official Airbnb design-system document, reconcile values here first, then update `apps/web/app/globals.css` to match. No page-level hard-coded colors outside these tokens.

## Tokens (`apps/web/app/globals.css` via Tailwind v4 `@theme`)

| Token | Value | Use |
|---|---|---|
| `rausch` | `#FF5A5F` | Primary actions, brand marks, active accents. Only accent on any page. |
| `rausch-dark` | `#E0484D` | Primary hover, error text |
| `babu` | `#00A699` | Success / live status only |
| `arches` | `#FC642D` | Reserved for warnings, not in Phase 1a |
| `hof` | `#484848` | Headings, body text, dark buttons |
| `foggy` | `#767676` | Secondary text, placeholders, icons |
| `pearl` | `#F7F7F7` | Page wells, quiet buttons, skeletons |
| `line` / `line-soft` | `#DDDDDD` / `#EBEBEB` | Borders, dividers |

Type: system sans stack (Cereal is proprietary and not bundled). Never pure black/white for text surfaces; headings `hof`, never `#000`.

## Shape and elevation

- Cards `12px`, inputs `8px`, buttons/pills `full`. One scale everywhere: buttons are always pill, cards always `12px`, inputs always `8px`.
- Shadows tinted to the background (`shadow-card`, `shadow-pop`); no pure-black drops.
- Light-only theme. No dark mode in v1 per PRD §28 and Airbnb parity.

## Components (`apps/web/components/ui.tsx`)

`Button` (primary/quiet/outline), `Card`, `Field` + `TextInput` (label above, error below, never placeholder-as-label), `StatusPill`, `EmptyState`, `SkeletonRows`. Icons from `@phosphor-icons/react` only, one family, `size={20}` nav / `22` feature.

## Page rules

- Landing: split hero (headline ≤ 2 lines, sub ≤ 20 words, 1 primary + 1 secondary CTA), stats strip, 3-card rhythm, one CTA band, footer. Max one marquee per page (none in v1); max one eyebrow per three sections (none in v1).
- App shell: fixed sidebar ≥ `lg`, drawer below; sticky 64px topbar with global search → `/hr/employees?q=`; section title per page.
- Honesty: dashboard cards label live vs phased data. No invented metrics. Stubs use `EmptyState` with the owning phase named.
- Motion: transitions only (`0.3s` ease-out, transform/opacity), `active:scale-[0.98]` on buttons. No scroll listeners, no custom cursors, no purple gradients.
