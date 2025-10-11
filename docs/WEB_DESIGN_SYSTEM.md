# WeatherVane Web Design System & Accessibility Notes

## Palette & Tokens
- Primary surfaces draw from `--color-surface-*` tokens defined in `apps/web/src/styles/globals.css` to keep contrast ≥4.5:1.
- Status palettes rely on semantic tokens:
  - `--status-info-*` for informational banners and loading states.
  - `--status-caution-*` for guardrails or pending review.
  - `--status-critical-*` for blocking issues and escalation badges.
- Success and neutral accents use `--badge-success-*` / `--badge-muted-*` to drive consistent chip styling in tables and panels.

## Focus & Navigation
- Global `:focus-visible` rules apply a high-contrast outline + ring to anchors, buttons, form controls, and summary elements.
- Layout renders a skip link (`Skip to main content`) at the top of the DOM; it becomes visible when focused.
- Navigation tabs expose the active route with `aria-current="page"` and inherit the same focus styling for keyboard parity.

## Panels, Banners, and Regions
- `ContextPanel` and `DisclaimerBanner` render as `<section role="region">` / `<section role="note">` with programmatic labels via `useId`.
- Warnings list emits polite live updates so assistive tech is notified when guardrails change.
- Status and error callouts now default to semantic colors with sufficient contrast and provide actionable retry controls.

## Data Visualisation & Tables
- Plan tables announce their purpose through a visually hidden `<caption>` and expose confidence badges with descriptive `aria-label`s.
- Elevated color chips, markers, and badges pull from the shared tokens to avoid red/green-only cues.

## Interaction Patterns
- Buttons across landing, plan, catalog, and actions modules inherit the global focus outline and add local `:hover` motion that respects `prefers-reduced-motion`.
- Error states on data-heavy pages (`plan`, `catalog`, `stories`) include retry buttons that reset the fetch loop while maintaining announcement semantics (`role="status"`/`role="alert"`).

## Future Enhancements
- Extend token usage into remaining CSS modules (automations, experiments) for full parity.
- Introduce calm mode (`data-theme="calm"`) to swap to solid surfaces for neurodiverse users.
- Centralize retry button styles in a shared component once Next.js pages adopt App Router.
