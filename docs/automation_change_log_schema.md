# Automations Change Log Schema

## Purpose
- Align WeatherVane web, API, and worker surfaces on a single narrative-friendly contract for automated change history.
- Guarantee that every log entry carries the context required to answer “What changed?”, “Why was it safe?”, and “What do I do now?” without bespoke adapters.
- Provide a durable reference for critics, Playwright/Vitest suites, and analysts wiring future approval workflows or telemetry exports.

## Top-Level Shape
The Automations page consumes an array of `AutomationAuditPreview` records:
- `id` – Stable identifier that maps to API/worker events (`automation.change.*`).
- `actor` – Human-readable name for who performed or proposed the change (WeatherVane actor, reviewer, system).
- `headline` / `detail` – Plain-language summary; `headline` must stand alone in tables, `detail` expands the why.
- `timeAgo` (string) / `minutesAgo` (optional number) – Relative timestamp; numeric minutes unlock SLA calculations.
- `status` – `"pending" | "approved" | "shadow"`; drives tone, default filters, and action affordances.
- `narrative` – Structured storytelling payload (see below).
- `evidence` – Award-level proof array (metrics + optional links) federated with `normaliseAuditEvidence`.
- `actions` – CTA set (`approve`, `rollback`, `acknowledge`, etc.) surfaced as first-class review buttons.

## Narrative Contract
`AutomationAuditNarrative` packages the trust-first columns rendered in the UI:
- `why` – The rationale in executive copy (“Heat spike uplift detected…”).
- `impactValue` / `impactLabel` – Metric highlight (“+18% ROAS”, “Confidence band”).
- `impactContext` or `impact` – Additional prose for compliance/legal review.
- `nextStep` – Explicit instruction for the reviewer (“Approve or request changes…”).
If any field is missing, `AutomationAuditList` falls back to legacy `detail` copy or sensible defaults so the column never collapses.

## Evidence Contract
`AutomationAuditEvidenceItem` entries contain:
- `label` / `value` – Metric headline, kept short for inline badges.
- `tone` (`success | caution | info`) – Matches design-system token to color the badge and evidence rows.
- `context` – Rich narrative displayed when the packet expands.
- `link` – Optional deep link to signed proof bundles, rehearsals, or dashboards.
Vitest suites (`tests/web/automation_audit_evidence.spec.ts`, `tests/web/automation_trust.spec.ts`) fail if packets drop required copy, tones, or demo fallbacks.

## Filtering & Metrics
- UI defaults to `"pending"` filter when any entry awaits review (`selectDefaultAutomationAuditFilter`).
- Summary banner tone adopts `"caution"` when pending approvals exist, `"success"` when only shipped changes, and `"info"` for rehearsals/empty states.
- Metric counters map directly to status counts; Playwright coverage now exercises the default pending focus and filter pivots.

## Integration Guidance
- API/worker producers should emit `minutesAgo` (or absolute timestamps) so overdue calculations stay accurate.
- Include reviewer identity in evidence (`id: "reviewer"`) to ensure human next-step copy names the accountable team.
- Maintain schema compatibility when adding new statuses: extend `AutomationAuditStatus`, update default tones/actions, and cover the change in Vitest + Playwright.

## Related Artifacts
- UI implementation: `apps/web/src/components/AutomationAuditList.tsx`.
- Demo builders: `apps/web/src/demo/onboarding.ts`.
- Trust helpers: `apps/web/src/lib/automationTrust.ts`, `automationInsights.ts`.
- Tests: `tests/web/automation_trust.spec.ts`, `apps/web/playwright/automations-trust.spec.ts`.
- Evidence foundations: `docs/automation_audit_evidence.md`.
