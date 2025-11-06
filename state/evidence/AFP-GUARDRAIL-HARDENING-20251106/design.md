# Design: AFP-GUARDRAIL-HARDENING-20251106

> **Purpose:** Specify the architecture for automated guardrail enforcement, telemetry, and self-healing so AFP/SCAS guardrails are sustained without manual policing.

---

## Context

Recent retros showed guardrails only worked after manual audits. We need a cohesive system that continuously monitors compliance (PLAN tests, daily audits, Wave 0 proofs) and automatically reacts when something slips.

---

## Five Forces Check

### COHERENCE
- Reuse existing scripts (ProcessCritic, rotate_overrides, Wave 0 proof) rather than inventing new mechanisms.
- Integrate with TaskFlow/Wave 0 autopilot already running in repo.

### ECONOMY
- Single orchestrator script collects guardrail checks, avoiding duplicate logic.
- Telemetry stored as JSONL—simple and append-only.

### LOCALITY
- Guardrail checks live under `tools/wvo_mcp/scripts/`, close to existing automation.
- Telemetry appended to `state/analytics/`.
- Follow-up tasks recorded in evidence/followups to keep context near tasks.

### VISIBILITY
- Monitor outputs machine-readable JSON and prints human summary.
- Telemetry log gives at-a-glance view of daily compliance.

### EVOLUTION
- Pattern: guardrail monitor + auto-remediation becomes reusable for other guardrails (lint, CI). Prove it here before scaling.

**Leverage:** High—affects entire repo guardrail posture; justify added complexity with strong evidence and tests.

---

## Via Negativa

- Avoid adding new critics—compose existing ones.
- Refrain from shipping separate orchestrators per guardrail; one monitor pipeline is sufficient.
- Instead of storing large logs in evidence, append concise JSON entries and rotate.

---

## Refactor vs Repair

- This is a refactor of enforcement (moving from manual to automated). We’ll adjust existing scripts minimally and add orchestration layer + telemetry.
- Guardrail monitor ensures root cause (lack of automation) is addressed instead of patching individual lapses.

---

## Alternatives Considered

1. **Manual Checklist Discipline**  
   - Pros: zero code; rely on agents.  
   - Cons: Already failed; lacks visibility or enforcement.

2. **Separate CI Jobs Per Guardrail**  
   - Pros: minimal integration; small scripts.  
   - Cons: Harder to interpret; scattershot; no unified telemetry or remediation hook.

3. **Selected Approach — Unified Guardrail Monitor**  
   - One command orchestrates all checks, produces telemetry, and triggers remediation. Easier to maintain and explain; scales to new guardrails.

---

## Complexity Impact

- Additional script + CI job increases pipeline complexity but drastically improves visibility.
- Telemetry file will grow; plan to rotate monthly.
- TaskFlow automation adds moving pieces; ensure clear logging to debug.

---

## Implementation Plan Snapshot

1. Create `tools/wvo_mcp/scripts/check_guardrails.mjs`:
   - Runs ProcessCritic (JSON output), rotate_overrides, daily audit check, Wave 0 smoke (`npm run wave0 -- --proof-smoke`).
   - Collects results, writes combined JSON entry, exits non-zero on failure.

2. Add CI workflow `guardrails.yml` to run monitor on PR/cron; upload telemetry artefact.

3. Update TaskFlow/Wave 0 automation:
   - On monitor failure, create or update remediation task (append to `state/evidence/<task>/followups.md`).

4. Add regression tests:
   - Unit tests for monitor (mock command failures).
   - Template/doc tests verifying that PLAN sections reference PLAN-authored tests, etc.

5. Document new workflow:
   - Update docs/checklists to mention monitor command and telemetry location.

---

## Risks & Mitigations

1. **Monitor flaps due to transient issues**  
   - Mitigation: allow `--allow-stale-audit` within same day; include retain-stale flag.

2. **CI run time**  
   - Mitigation: use proof smoke (no long builds), parallelise where possible, bail fast on first failure.

3. **Auto-remediation spamming tasks**  
   - Mitigation: aggregator ensures only one remediation task per guardrail per day; updates followups instead of new tasks.

---

## Testing Strategy

- Unit tests for monitor orchestrator (mocking command success/failure).
- Integration: run monitor end-to-end in CI triggered by this task (with smoke mode).
- Manual: intentionally break guardrail to confirm monitor fails and auto-remediation triggers.
