# WeatherVane Web Design System & Accessibility Notes

## Palette & Tokens
- Primary surfaces draw from `--color-surface-*` tokens defined in `apps/web/src/styles/globals.css` to keep contrast ≥4.5:1. Stories, Plan, and Automations modules layer their aurora gradients on top of these surfaces via local `--*backdrop` tokens that swap automatically with the calm theme.
- Status palettes rely on semantic tokens:
  - `--status-info-*` for informational banners and loading states.
  - `--status-caution-*` for guardrails or pending review.
  - `--status-critical-*` for blocking issues and escalation badges.
- Success and neutral accents use `--badge-success-*` / `--badge-muted-*` to drive consistent chip styling in tables and panels, while orchestrated calm variants adjust border opacity to preserve contrast.
- Typography scale now spans `--font-size-2xs` → `--font-size-3xl` with matching weights and spacing helpers (`--font-letter-*`). Global utilities (`.ds-eyebrow`, `.ds-display`, `.ds-title`, `.ds-subtitle`, `.ds-body`, `.ds-caption`, `.ds-metric`) ship alongside the tokens so hero copy, tables, and metric callouts present with consistent rhythm without duplicating module CSS.
- Motion tokens cover micro to expressive timings (`--motion-duration-micro`, `--motion-duration-short`, `--motion-duration-expressive`) with standard, accelerate, decelerate, and emphasized easing curves. Components inherit these curves automatically while the reduced-motion dataset collapses transitions to near-zero.
- Surface tokens (`--surface-panel`, `--surface-card`, `--surface-highlight`) and elevation presets (`--shadow-soft`, `--shadow-elevated`, `--shadow-glow`) unify glass, panel, and spotlight treatments across Layout, Plan, ContextPanel, and insights tiles.
- Utilities `.ds-surface-panel`, `.ds-surface-card`, and `.ds-badge[data-tone=*]` bundle those tokens into drop-in classes for panels, cards, and severity chips, while `.ds-transition` standardises hover/focus motion across navigation, chips, and toggles.
- Onboarding readiness and guardrail audit lists now compose `.ds-surface-panel` + `.ds-surface-card` wrappers with `data-tone` badges so fallback, syncing, and escalation states inherit the same semantic palette without duplicating CSS.

## Focus & Navigation
- Global `:focus-visible` rules apply a high-contrast outline + ring to anchors, buttons, form controls, and summary elements.
- Layout renders a skip link (`Skip to main content`) at the top of the DOM; it becomes visible when focused.
- Navigation tabs expose the active route with `aria-current="page"` and inherit the same focus styling for keyboard parity.

## Panels, Banners, and Regions
- `ContextPanel` and `DisclaimerBanner` render as `<section role="region">` / `<section role="note">` with programmatic labels via `useId`.
- Warnings list emits polite live updates so assistive tech is notified when guardrails change.
- Status and error callouts now default to semantic colors with sufficient contrast and provide actionable retry controls.
- Shared panel surfaces rely on `var(--surface-panel)` + `var(--shadow-soft)` while high-emphasis highlights switch to `var(--surface-highlight)` + `var(--shadow-elevated)`. Applying `.ds-surface-glass` adds blur + glass borders without custom CSS.
- Allocator instrumentation panels (`CreativeGuardrailPanel`, `RLShadowPanel`, `SaturationPanel`, `BacktestChart`, and `IncrementalityPanel`) now rely on the shared `.ds-*` typography scale and aria labelling for consistent reading rhythm alongside the Plan page summaries.
- ContextPanel badges log critical states with the design-system `.ds-badge[data-tone="critical"]` treatment and keep the warning list live region aligned with semantic severities.

## Data Visualisation & Tables
- Plan tables announce their purpose through a visually hidden `<caption>` and expose confidence badges with descriptive `aria-label`s.
- Elevated color chips, markers, and badges pull from the shared tokens to avoid red/green-only cues.

## Interaction Patterns
- Buttons across landing, plan, catalog, and actions modules inherit the global focus outline and add local `:hover` motion that respects `prefers-reduced-motion`.
- Error states on data-heavy pages (`plan`, `catalog`, `stories`) include retry buttons that reset the fetch loop while maintaining announcement semantics (`role="status"`/`role="alert"`).

## Themes & Motion
- Theme state is managed by `ThemeProvider` (`apps/web/src/lib/theme.tsx`) and persisted via `data-theme` on `<html>`. A new Theme Toggle in the layout header lets users switch between the default **Aero** look and a lower-contrast **Calm** palette. System `prefers-color-scheme` is honoured until a manual choice is made.
- Background gradients, tab glassmorphism, panel hover states, and navigation micro-interactions all reference the shared motion/surface tokens for consistent easing. Stories and Automations adopt the same hover curves and disable transform-driven interactions whenever `prefers-reduced-motion` is active.
- Layout introduces a subtle aurora backdrop animation tuned with the emphasized easing curve that automatically collapses when the user enables reduced motion.

## Future Enhancements
- Consolidate landing and marketing gradients into reusable token sets so launch pages inherit the same calm/aero variants without bespoke CSS.
- Centralize retry button styles in a shared component once Next.js pages adopt App Router.
- Formalise a shared panel mixin (border + shadow) to reduce per-module overrides as additional surfaces ship.
