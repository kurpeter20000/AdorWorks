# Platform design system

Reference for anyone building UI in `platform/` (the authenticated AdorWorks
app). Written after a competitive-UX research pass (Upwork/Fiverr/Terawork)
surfaced real gaps in the public-facing hero pattern — see that research for
the "why"; this doc is the "what to build against" so nobody invents ad hoc
styles instead of using what's here.

## What's already decided (don't redo this work)

- **Palette**: `platform/src/app/globals.css` defines the real brand tokens —
  `--color-midnight` (ink), `--color-teal` (accent), `--color-violet`
  (secondary), `--color-coral` (danger), `--color-cloud` (surface-alt),
  `--color-slate` (muted). These are the *same* tokens as the public site's
  `css/themes.css`, deliberately, so the two surfaces read as one product.
  `--color-teal-ink` and `--color-coral-ink` are darkened, WCAG-AA-checked
  variants for text-on-white use (the base teal/coral fail contrast as text
  color; they're fine as button/badge backgrounds).
- **Dark mode**: explicitly out of scope. The `globals.css` comment says why —
  the public site has no dark mode either, and an unreviewed dark palette
  would drift the brand rather than extend it. Revisit deliberately if this
  ever changes; don't add a `prefers-color-scheme` block as a side effect of
  an unrelated change.
- **Focus rings**: global `:focus-visible { outline: 3px solid var(--color-coral); }`
  in `globals.css` already covers every focusable element. New components
  don't need to define their own focus ring.

## New tokens (added alongside the above, not replacing them)

| Token | Value | Use |
|---|---|---|
| `--color-accent-hover` | `#00967f` | Button/link hover state (teal-family) |
| `--color-accent-active` | `#00786a` | Button/link pressed state (same value as `--color-teal-ink`) |
| `--color-warning` | `#f59e0b` | Warning badge/background |
| `--color-warning-ink` | `#b45309` | Warning text-on-white (≈5.02:1, passes AA) |

## Component library (`src/components/ui/`)

All built with `class-variance-authority` for variants and a shared `cn()`
helper (`src/lib/utils.ts`, clsx + tailwind-merge) for class merging. Icons
are from `lucide-react` — don't hand-roll one-off SVGs.

- **`Button`** — variants `primary` (solid teal) / `secondary` (outlined
  midnight) / `ghost` (text-only). Sizes `sm` / `md` / `lg`. Pass `loading`
  for a spinner + disabled-interaction state.
- **`Input`** — plain styled text input, token-based border/placeholder
  colors.
- **`SearchBar`** — rounded pill container: leading search icon, `Input`,
  trailing solid `Button`. It's a form primitive only — it does **not** know
  where a search should go. The caller supplies `onSubmit` (or lets the form
  submit normally with a `name`/action). Built for the hero-search pattern
  identified in the competitive research; wire it to a real destination when
  you use it, never to a dead end.
- **`Chip`** — pill link, optional trailing arrow. `variant="onPhoto"` for
  placement over a photo/hero background (translucent dark, blurred), 
  `variant="plain"` for a normal surface.
- **`Card`** — base container (border, radius, padding) with an optional
  `icon` slot. `StatePanel` (`src/components/state-panel.tsx`) now renders
  through this — its own `tone`/`role` props are unchanged, only its
  underlying markup changed.
- **`Badge`** — small pill label. Variants `neutral` / `success` / `warning`
  / `danger` / `accent`. Use for things like "AdorVerified", role labels,
  "launching soon".

## What this doc deliberately does not cover

Rebuilding the public marketing site inside `platform/` — that site already
exists and is deployed (the root of this repo, `adorworks.netlify.app`), so
the competitive-research recommendations that apply to a *hero* (search bar,
category chips, two-path CTA instead of three flat buttons) get applied
there, in plain HTML/CSS, not duplicated here as React routes.
