# Experiments & Reports Validation Study

**Date:** 2025-10-19  
**Lead:** Atlas (Autopilot Captain)  
**Scope:** Experiments dashboard, report exports, guardrail alerts, instrumentation health

## Purpose
WeatherVane must ship the T3.4.x Experiments/Reports surfaces with evidence-backed usability for revenue-owning execs, operations managers, and analytics stewards. This study validates whether the current experience answers their core questions, quantifies the gaps, and clarifies what design + engineering work is required before implementation moves forward.

## Research Questions
1. Can executives understand experiment outcomes and approve budget changes in under 2 minutes?
2. Do operations managers have the evidence and tooling to translate lift into action without leaving WeatherVane?
3. Can analysts audit instrumentation quality and communicate next steps without duplicating work in spreadsheets?
4. What acceptance metrics define “ready for production” for the Experiments/Reports slice?

## Methodology
- **Format:** Moderated remote sessions (Screen share via Zoom) with think-aloud and structured post-task survey.
- **Artifacts tested:** Wireframe prototype `experiments-mvp-wireframe-2025-10-18` rendered in Figma with interactive hotspots.
- **Data captured:** Task success, completion time, confidence before/after, System Usability Scale (SUS), qualitative notes.
- **Personas covered:** Sarah (CMO), Leo (Marketing Ops Manager), Priya (Growth Analyst).
- **Session logs:** Stored under `state/artifacts/research/experiments_sessions/` as JSON.

## Participants
| Persona | Company Stage | Channel Focus | Session Length | Tool Familiarity |
|---------|---------------|---------------|----------------|------------------|
| Sarah – CMO | Enterprise retail consortium | Omnichannel, 8-figure spend | 35 min | Reviewed WeatherVane dashboards twice/month |
| Leo – Marketing Ops Manager | High-growth DTC apparel | Paid social, search | 45 min | Daily WeatherVane operator |
| Priya – Growth Analyst | Multi-brand marketplace | Analytics & instrumentation | 50 min | Spoke at onboarding; heavy BigQuery user |

## Acceptance Metrics
| Metric | Target | Sarah | Leo | Priya | Result |
|--------|--------|-------|-----|-------|--------|
| Task success (critical tasks) | ≥ 80% | 50% | 67% | 67% | **Miss** – clarity + action gaps |
| Decision confidence delta | +2 points | +1 | +2 | +1 | **Miss** – exec + analyst still unsure |
| Time to actionable decision | ≤ 120s | 210s | 140s | 240s | **Miss** – retry + incident flows too hidden |
| SUS | ≥ 75 | 68 | 74 | 71 | **Miss** – needs copy, export, ownership fixes |
| Evidence export coverage | 100% | 50% | 80% | 40% | **Miss** – no slide/JSON templates |

**Verdict:** The experience is not yet production-ready. We must translate statistical outputs into executive language, surface recovery workflows inline, and provide export/ownership tooling before implementation proceeds.

## Key Findings
### Cross-persona themes
- **Decision hand-off is under-specified.** All personas requested clear next actions, owners, or direct exports after reviewing lift. Without those, they revert to spreadsheets or screenshots.
- **Statistical jargon erodes trust.** “p-value” and “95% CI” copy caused confusion; replacing with plain-language confidence statements and guardrail icons is mandatory.
- **Retry + incident flows are invisible.** Critical recovery actions hide in overflow menus; failure cards need inline remediation steps, ownership fields, and telemetry links.
- **Data provenance must be transparent.** Participants want direct links to raw data (BigQuery exports, CSV, or slide template) to close the loop with their teams.

### Persona-specific insights
- **Sarah (CMO):** Needs an executive summary card translating lift into “Approve budget change?” decisions, plus pre-formatted board slides. She will not parse statistical charts without clear narrative.
- **Leo (Marketing Ops):** Comfortable with charts but requires guardrail context (legend thresholds, webhook diagnostics). Suggested bundling CSV exports with guardrail metadata.
- **Priya (Analyst):** Focused on instrumentation reliability. Requests owner assignment, next-step capture, and JSON exports to feed monitoring scripts.

### Evidence Snapshots (selected)
- Sarah quote: “If you want me to bless the spend increase, tell me plainly what changed and what happens if I'm wrong.”
- Leo quote: “Give me the segment CSV so I can paste into the guardrail tracker without cleanup.”
- Priya quote: “I need an audit log with ownership fields when instrumentation slips.”

## Recommendations
1. **Executive approval summary:** Add a hero card summarizing outcome, risk, recommended budget action, and fallback plan. Include confidence chip (< 180 characters) and link to export slides.
2. **Guardrail-aware exports:** Ship CSV + Google Slides templates that package lift, guardrails, and narrative copy. Trigger from primary action buttons, not overflow menus.
3. **Inline recovery workbench:** Move retry/incident controls out of overflow, add owner assignment, deadline, and raw log links on failure cards.
4. **Plain-language confidence language:** Replace statistical notation with accessible phrasing (e.g., “WeatherVane is 92% confident this will add $112K revenue next quarter”). Pair with iconography consistent with guardrail severity tokens.
5. **Data provenance affordances:** Provide “View raw events” (BigQuery URL) and “Download JSON for monitoring” options for analysts.
6. **Instrumentation health banner:** Surface sample size, treatment balance, and webhook status as first-class chips above the fold.

## Design & Engineering Implications
- **Design system:** Extend badge/token set for confidence levels and guardrail severity; ensure calm/aero theme parity.
- **API/worker:** Expose experiment segments with guardrail metadata and raw event links via `/v1/experiments/{tenant}` response; add instrumentation status endpoint.
- **Frontend:** Build export modal with CSV/Slides templates, inline retry workflow (owner assignment, notes), and executive summary card.
- **Analytics:** Track `experiments.summary_exported`, `experiments.retry_triggered`, and `experiments.incident_assigned` events with persona dimension for ongoing validation.

## Edge Cases & Risks
- High-variance experiments with low sample size risk misinterpretation; require warning state that blocks “Approve” until guardrail thresholds met.
- Multi-tenant execs need persona-specific exports; ensure template builder merges brand tokens dynamically.
- Incident ownership fields must sync with Jira/Slack hooks; blocking this integration will produce duplicate work.

## Next Steps
1. Prototype executive summary + export modal updates; validate with Sarah + Leo via quick follow-up review (target: 2025-10-22).
2. Partner with data engineering to expose raw event URLs and guardrail metadata through API contract update (`PlanResponse.incrementality_summary`).
3. Implement retry/incident workbench in Experiments MVP (T3.4.4) and add analytics events listed above.
4. Re-run usability validation (3 sessions) once changes ship; target SUS ≥ 78 and task success ≥ 90%.
5. Update exec-review checklist with new acceptance criteria so critic automation enforces the research-backed bar.

## Appendices
- **Session logs:** `state/artifacts/research/experiments_sessions/*.json`
- **Open questions:**
  - Should the executive summary card support scenario toggles (optimistic vs conservative)?
  - What security review is required to expose raw event URLs in the UI?
- **Dependencies:** Guardrail telemetry must remain stable; relies on prior allocator performance fixes logged 2025-10-20.

