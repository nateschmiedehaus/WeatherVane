# WeatherVane Component Library & Motion Guidelines
Last updated: 2025-10-16  
Authors: WeatherVane product · design · engineering

> This library defines the component system that backs the WeatherVane product experience. It translates the Falcon design tokens and calm/aero themes into implementation-ready guidance for T3.3.4 and downstream M3.4 builds. Each component family documents structure, states, motion, and instrumentation expectations so API, worker, and web slices ship with consistent interaction contracts. T3.3.x remains MCP-owned; this doc clarifies how its deliverables flow into product implementations.

---

## 1. Foundations

### 1.1 Tokens & Theming
- **Color surfaces** – Compose `--surface-panel`, `--surface-card`, and `--surface-highlight` via `.ds-surface-*` utilities. Default to Aero; Calm mode swaps token values without altering component markup.
- **Semantic tones** – Severity chips and badges MUST use `.ds-badge[data-tone]` with `info|caution|critical|success|muted`. Never hard-code hex values; inherit the semantic palette for accessibility parity.
- **Typography scale** – Map component hierarchy to `.ds-display`, `.ds-title`, `.ds-subtitle`, `.ds-body`, `.ds-caption`, and `.ds-metric`. Modules may layer numeric/monospace accents via `--font-letter-*` helpers, but keep the base utility classes intact for responsive rhythm.
- **Motion tokens** – Reference `--motion-duration-{micro,short,expressive}` with easing curves (`standard`, `accelerate`, `decelerate`, `emphasized`). Reduced-motion users collapse to the `micro` duration and neutral easing automatically.
- **Shadow & elevation** – Panels and drawers lean on `--shadow-soft` and `--shadow-elevated`. Spotlight states (hero metrics, critical alerts) can add `--shadow-glow` plus `border-color: var(--surface-highlight-border)`.

### 1.2 Patterns & Instrumentation
- All actionable elements emit telemetry events named `module.component.event`. Example: the Plan approve button emits `plan.card.approve`.
- Component props include `data-test` hooks aligned with pytest/Vitest suites so regression harnesses can interact with demos and live data consistently.
- Every component ships ARIA roles, labels, and `:focus-visible` outlines via shared utilities; custom markup MUST retain those hooks.

---

## 2. Component Families

### 2.1 Layout Primitives
- **App shell** – Header, left navigation, content viewport. Skeleton template: `<Layout data-theme={theme}>` with skip link, persona switcher, and telemetry banner injection. Uses `.ds-transition` for nav hover and `.ds-surface-panel` for drawers.
- **Context & Command panels** – `ContextPanel`, `AutomationDrawer`, `ScenarioBuilder`. Each exposes `aria-labelledby`, `role="region"` or `role="dialog"`, and composes `.ds-surface-panel`. Motion: slide-in/out on `--motion-duration-short` easing `decelerate`. Reduced-motion: fade opacity only.
- **Grid & stack utilities** – Use CSS vars `--layout-gap` + `grid-template-columns` tokens to keep spacing consistent. Cards align to an 8px baseline; gutters mirror IA wireframes.

### 2.2 Navigation & Wayfinding
- **Primary navigation** – Top tabs + secondary pills (`Plan`, `WeatherOps`, `Experiments`, `Reports`). Active tab uses `.ds-badge[data-tone="info"]` underline plus `aria-current="page"`. Hover/active transitions run `--motion-duration-short` with emphasized easing.
- **Persona & mode pills** – Shared `PillToggle` component toggles persona (Sarah, Leo, Priya) and mode (Live, Assist, Demo). Instrumentation: `persona_select`, `plan.mode_switch`. Visual treatment: `.ds-badge[data-tone="muted"]` base; selected state upgrades to `info` tone.
- **Breadcrumb & section headers** – `.ds-eyebrow` for context labels, `.ds-title` for H1. Section transitions fade in at `--motion-duration-micro`.

### 2.3 Data & Insight Surfaces
- **Metric cards** – Compose `.ds-surface-card` + `.ds-metric`. Primary KPI card includes sparkline slot, delta badge, and CTA button. Data contract expects numeric value, delta, confidence, and optional guardrail status.
- **Tables & lists** – `InsightTable`, `AlertList`, `ConnectorChecklist`. Require hidden `<caption>`, row-level `aria-label`s, and severity badges for status cells. Motion: row hover uses `standard` curve; list item insertions animate via `accelerate`.
- **Charts & maps** – Maplibre + delta charts frame weather risk. Provide `aria-describedby` pointing to textual summaries. Interactions emit `dashboard.weather_focus`, `proof.attach_to_plan`, etc.

### 2.4 Controls & Inputs
- **Primary/secondary buttons** – `Button` component handles variants (`primary`, `secondary`, `link`). All buttons pull from tokens for background/outline and run `--motion-duration-micro` hover transitions. Ensure `disabled` states reduce opacity but keep ≥3:1 contrast.
- **Segmented controls & toggles** – `SegmentControl`, `Switch`, `CheckboxGroup`. Telemetry events follow `component.value_selected`. Keyboard navigation: arrow keys cycle segments, space toggles switch.
- **Form fields** – `TextField`, `NumberField`, `DateRangePicker`. Inline validation surfaces `.ds-caption` helper text with `data-tone` severity. Error icon uses `--status-critical-*` palette.

### 2.5 Feedback & Status
- **Banners** – `DisclaimerBanner` / `WeatherAlertBanner` use `.ds-surface-panel` with `role="status"` or `role="alert"`. Buttons inside banners follow primary/secondary variants above.
- **Toasts & snackbars** – `ToastManager` anchors in the activity rail. Motion: slide from bottom using `accelerate` on entry, `decelerate` on exit. Reduced-motion: fade only.
- **Progress indicators** – Inline `ProgressDot` arrays for connector setup, `ProgressBar` for ingestion backlog, `Skeleton` for load states. Always include `aria-live="polite"` updates for long-running operations.

### 2.6 Overlays & Dialogs
- **Modal dialogs** – `Modal` with focus trap, close telemetry `modal.close`. Background scrim uses `--surface-panel` transparency, enters with `--motion-duration-short` fade.
- **Drawers** – Right-aligned for Automations, left-aligned for Onboarding. Each includes header region (`.ds-title`), body scroll area, footer actions, and keyboard shortcuts (`Esc` to close). Instrumentation: `drawer.open`, `drawer.submit`.

---

## 3. Motion Guidelines

### 3.1 Timing Ladder
| Motion tier | Duration token | Usage |
| --- | --- | --- |
| Micro | `--motion-duration-micro` (80ms) | Button hover, badge emphasis, icon pulses |
| Short | `--motion-duration-short` (160ms) | Drawer open/close, tab transitions, toast entry |
| Expressive | `--motion-duration-expressive` (320ms) | Hero aurora, weather map focus shifts, scenario builder launch |

- Pair micro/short durations with the standard easing for UI chrome. Expressive motions adopt emphasized easing to feel guided but not sluggish.
- Chain transitions with 40ms staggering maximum; multiple components should not animate simultaneously unless part of the same composite action (e.g., approving a plan card).

### 3.2 Interaction Patterns
- **Affordance** – Hover states scale no more than 1.02x and fade outlines. Avoid shadow jumps greater than one elevation token.
- **Feedback** – Success toasts linger 2.5s, critical alerts persist until user acknowledges. Animations for critical alerts should pulse opacity instead of position to respect reduced-motion overrides.
- **Context shifts** – When launching scenario builder or Automations diff drawer, blur background panels using `--surface-glass` tokens and run `decimate` easing so the new context feels anchored.

### 3.3 Reduced Motion
- Detect `prefers-reduced-motion` via ThemeProvider. Suppress scale transforms, convert slides to opacity fades, and ensure skeleton loaders do not shimmer. Provide a settings toggle to persist reduced-motion preference for operator personas.

---

## 4. Accessibility & Telemetry Checklist
- Include keyboard-first specs: focus order, shortcuts, skip links. Every new component entry should document tab order and escape hatches.
- Document analytics IDs alongside props. When adding a new component variant, extend the telemetry table in `docs/product/wireframes.md` or module README so the data team can wire pipelines.
- Provide demo data defaults. Components must render meaningful content under demo mode using seeds in `apps/web/src/demo/`.
- Capture error/loading/empty states with copy guidance. Each component family outlines baseline copy; unique flows (e.g., Executive Reports exports) can extend as long as they maintain tone and telemetry.

---

## 5. Handoff Expectations
- Figma components must map 1:1 with code primitives (`Button`, `PillToggle`, `InsightTable`). When variants diverge, add notes in this doc plus `docs/WEB_DESIGN_SYSTEM.md`.
- Implementation tickets should reference component names, variant, instrumentation, and required critic coverage (Design System, Tests, Exec Review). If critics are capability-gated, record blockers in task memos and keep the task in `blocked`.
- Before shipping a slice:
  1. Verify component props, states, and telemetry in storybook or sandbox.
  2. Run relevant critics (`design_system`, `tests`, `manager_self_check`) once capability profile allows.
  3. Attach artifacts (screenshots, recordings, telemetry exports) to the roadmap task for Director Dana review.

---

Atlas treats this library as the contract binding design, engineering, and data teams. Update it whenever new primitives land or motion standards evolve, and broadcast changes through release notes plus the design_system critic once capacity returns.
