# Design System Acceptance Review (Stories & Reports)

**Review window:** 2025-10-20  
**Reviewer:** Atlas (Autopilot Captain)  
**Test evidence:** `npm --prefix apps/web run test -- --run tests/web/design_system_acceptance.spec.ts`, `bash tools/wvo_mcp/scripts/run_integrity_tests.sh`

## Scope & Objectives
- Validate that the recently shipped Stories and Reports surfaces conform to WeatherVane's design-system primitives before Product sign-off.
- Close regressions flagged by the design_system critic: inconsistent action styling, missing status patterns, and silent clipboard failures.
- Expand automated coverage so future UI changes keep the acceptance bar.

## Implementation Outcomes
- **Unified interaction tokens**: introduced global `.ds-button` variants and `.ds-status` badges in `apps/web/src/styles/globals.css`, replacing per-page button CSS so interactions inherit typography, motion, and tone semantics. Buttons now expose `data-variant` + `data-state` for tests and critics.
- **Clipboard feedback hardening**: Stories and Reports copy flows now emit success/critical status tones through the shared status component, with accessibility-aligned `role="status"` + `aria-live="polite"`. Failure cases surface actionable guidance instead of silent catches.
- **Evidence-first tests**: `tests/web/design_system_acceptance.spec.ts` asserts presence of design tokens across happy/error paths (buttons, tones, skip links) so critic automation can guard regressions.

## Observations & Decisions
- Stories grid already used spacing tokens; biggest variance was bespoke `.primaryAction` styling. Migrating to `.ds-button` preserved layout while aligning focus rings, motion easing, and theme overrides.
- Reports share block now clearly communicates hierarchy: primary action carries gradient, secondary occupies tonal secondary token, email handoff stays ghost. Critical tone surfaces when clipboard denied, matching Autopilot escalation heuristics.
- Clipboard APIs remain the flaky edge case—tests explicitly mock failure to make sure UX still guides the operator.

## Follow-ups
1. Migrate remaining product slices (`landing`, `setup`, `weather-runbook`) onto `.ds-button` and `.ds-status` primitives to remove silhouette drift.
2. Extend design_system critic snapshot to capture `.ds-button` usage density per page for future telemetry dashboards.
3. After button migration, refresh design tokens documentation (`docs/product/design_system.md`) with variant reference tables and tone examples.

## Risks & Mitigations
- **Risk:** Legacy CSS modules may reintroduce divergent button styling.  
  **Mitigation:** Tests assert for `.ds-button` presence; add lint rule if drift recurs.
- **Risk:** Reduced-motion users may still see gradient pop.  
  **Mitigation:** `.ds-button` honours existing `[data-reduced-motion]` overrides; verify once remaining pages migrate.

## Sign-off
- Stories & Reports align with current design system tokens and pass variance checks. Remaining pages queued in backlog item **T3.4.6 – Design system sweep**.
