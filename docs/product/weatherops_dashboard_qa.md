# WeatherOps Dashboard – Responsive QA Evidence

## Purpose
Design_system critic is still offline, so we are documenting responsive behaviour for the WeatherOps weather focus surface. This note captures the automated evidence that the suggestion banner and region filters adapt correctly across mobile, tablet, and desktop breakpoints.

## Breakpoint Coverage
- `tests/web/test_dashboard.spec.ts` now exercises `resolveViewportBreakpoint` at the exact boundary values (639 px ↔ 640 px and 1023 px ↔ 1024 px) to ensure viewport classification matches the CSS media queries that drive banner and filter layout changes.
- The same suite feeds the derived breakpoint into `buildSuggestionViewEvent` / `buildSuggestionFocusEvent`, proving that analytics payloads reflect the responsive state users experience on actual devices.

## Region Filter Confidence
- Existing vitest cases in `tests/web/test_dashboard.spec.ts` keep the region filters honest by verifying slug-based selection, whitespace normalisation, and active timeline highlighting. Together with the new breakpoint tests we now assert both behavioural and responsive facets of the filter workflow.

## Idle Suggestion Storytelling
- When telemetry surfaces no regional recommendation the dashboard now renders an idle-state banner instead of leaving the suggestion slot blank, keeping operators oriented during quiet weather windows.
- Copy is generated through `buildWeatherSuggestionIdleStory()` so we can explain the current weather coverage (event counts, high-risk alerts) and anchor expectations with the next potential weather window.
- Regression coverage lives alongside the other dashboard insight tests: `tests/web/test_dashboard.spec.ts` now includes focused + integration cases that fail if we stop summarising counts or upcoming schedules.

## Suggestion Telemetry Confidence
- WeatherOps now annotates each suggestion summary with a “Signal confidence” badge, translating raw view and interaction counts into high/medium/low confidence copy so operators know when rates are trustworthy.
- Confidence thresholds intentionally err conservative: ≥60 views or ≥20 focus/dismiss interactions score as “High confidence”; ≥20 views or ≥6 interactions emit a “Directional signal”; anything lower (including zero-view, filtered aggregates) stays “Low sample”.
- Vitest coverage in `tests/web/test_dashboard.spec.ts` locks the thresholds and copy so UI or summarisation regressions fail fast, and the dashboard template renders the new label with a `data-confidence-level` hook for future styling.

## Known Gaps
- No visual regression suite yet; once the design_system critic returns we should capture Playwright screenshots per breakpoint to complement these functional assertions.
