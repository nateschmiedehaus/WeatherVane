# PLAN - AFP (Meta)

**Date:** 2025-11-20  
**Author:** Codex

## Approach
- Formalize AFP as default workflow: 10 phases, critics (strategy/thinking/design/process/tests), guardrail monitor, daily audit, commit:check, wave0/live checks where applicable.
- Use this meta artifact as a reusable anchor for all AFP-tagged tasks.

## Scope / Files
- `state/evidence/AFP/strategy.md` (exists)
- `state/evidence/AFP/spec.md` (this task)
- `state/evidence/AFP/plan.md` (this file)
- `state/evidence/AFP/think.md`
- `state/evidence/AFP/design.md`

## Verification Inputs
- Critics run: strategy, thinking, design, process/tests on AFP-tagged tasks.
- Guardrail monitor + daily audit freshness.
- commit:check + wave0/waveX live check when relevant to autopilot code.

## PLAN-authored tests
- `cd tools/wvo_mcp && node scripts/check_guardrails.mjs` (guardrail suite)
- `cd tools/wvo_mcp && node scripts/rotate_overrides.mjs --dry-run` (daily audit freshness)
- `cd tools/wvo_mcp && npm run commit:check` (git hygiene)
- `cd tools/wvo_mcp && npx vitest run src/immune/gatekeeper.test.ts` (representative unit gate)
- `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run` (manual live smoke when autopilot touched)

## Risks / Mitigations
- Risk: Meta docs become stale → add checkpoint in daily audit/guardrail to verify presence.
- Risk: Bypass patterns persist → mandate remediation tasks per bypass with full AFP cycle.
- Risk: Scope creep beyond 5 files/150 LOC → enforce micro-batching and evidence exemption rules.

## Out of Scope
- Implementing specific feature work; this is governance meta-layer.
