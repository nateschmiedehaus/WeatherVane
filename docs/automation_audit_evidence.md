# Automation Audit Evidence Packets

## Purpose
- Elevate the automations audit trail with award-level evidence that ties each log entry to measurable business safeguards.
- Give Atlas, product, and Director Dana a concise source of truth on why Autopilot actions cleared guardrails.
- Provide structured hooks for future critics (exec_review, design_system) to validate packet integrity without reverse-engineering demo seed data.

## Data Shape
- `AutomationAuditEvidenceItem` now describes each highlight with:
  - `label` and `value` for the headline metric (ROAS uplift, Budget Δ, Lift p95, etc.).
  - Optional `tone` (`success`, `caution`, `info`) to mirror guardrail posture semantics.
  - Optional `context` string for narrative copy surfaced in the expanded packet view.
  - Optional `link` payload (`href`, `label`) pointing to the signed proof bundle or rehearsal log.
- Demo builders seed deterministic packets per automation mode (manual, assist, autopilot) so screenshots and onboarding tours stay consistent.
- Live API responses may ship sparse (`label`/`value` only) or reordered evidence arrays; `normaliseAuditEvidence` merges them with fallback demo context, preserving tone and friendly link names.

## UI Behaviour
- `AutomationAuditList` surfaces a trio of inline badges for quick scanning, then a collapsible "Evidence packet" panel with the full narrative, reinforcing compliance posture without overwhelming the list view.
- Evidence rows inherit tone colouring on the border, highlight metric values, and show optional deep links for ethics/compliance traceability.
- The component maintains `aria-live="polite"` while treating the evidence wrapper as a grouped region so screen readers announce packet context once expanded.
- Trust summary header now condenses the audit rail into a single, tone-aware narrative:
  - Caution tone highlights pending approvals with the exact reviewer action and SLA reminder.
  - Success tone celebrates clean Autopilot shipments, referencing the latest impact highlight plus rehearsal readiness.
  - Info tone keeps shadow rehearsals and empty states transparent, ensuring first-time users know what proof will appear next.
- Summary metrics (shipped, needs review, rehearsals) persist even in fallback/demo states so execs can quickly assess trust posture.
- Change log filters default to “Needs review” whenever approvals are waiting, while keeping one-click toggles for shipped and rehearsal entries. Counts update inline so operators can audit how many stories disappear under each filter.

## Testing
- `tests/web/automation_audit_evidence.spec.ts` exercises:
  1. Demo builder coverage (small unit) to guarantee award-level proof fragments stay populated for screenshots.
  2. Evidence normalisation (large unit) to confirm live packets override metrics while fallback context and tone remain intact.
- These tests would fail if packets stopped emitting rehearsal links, if tone mapping regressed, or if server payloads dropped context without fallback recovery.

## Known Limitations
- Links currently target demo-friendly routes; production wiring must inject tenant-aware URLs once Autopilot storage APIs are exposed.
- Evidence packets display a single tier today - future iterations may stack guardrail breaching cases or include attachments; the data contract leaves room for richer `context` strings but not binary blobs.
- No critic automation yet enforces JSON schema validation on `evidence` payloads; until then, `normaliseAuditEvidence` guards against empty labels/values but cannot catch semantic drift (e.g., incorrect ROAS calculations).
