# PLAN - AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120

## Approach
- Wire Gatekeeper into a hook/integration script (pre-push or orchestrator entry) to enforce branch/commit/CI gates.
- Add/adjust tests for Gatekeeper paths.
- Harden Wave0 lock handling (stale PID/TTL cleanup) so dry-runs don’t stay blocked.
- Update guardrail monitor or document linkage to Gatekeeper.

## Files to Change
- tools/wvo_mcp/src/immune/gatekeeper.ts (if needed/config tweak)
- tools/wvo_mcp/scripts/<hook or integrator>.mjs (new or existing) to invoke Gatekeeper
- tools/wvo_mcp/src/immune/gatekeeper.test.ts (tests)
- tools/wvo_mcp/src/wave0/runner.ts (stale lock handling)
- tools/wvo_mcp/src/wave0/runner.test.ts (new tests)
- Evidence files under state/evidence/AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120/

## PLAN-authored tests (VERIFY)
- `cd tools/wvo_mcp && npx vitest run src/immune/gatekeeper.test.ts`
- `cd tools/wvo_mcp && npx vitest run src/wave0/runner.test.ts`
- `cd tools/wvo_mcp && node scripts/check_guardrails.mjs`
- `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run` (record lock/blockers; expect stale lock auto-clean)
- `cd tools/wvo_mcp && npm run commit:check` (hygiene status)

## Milestones
1) Add integration hook invoking Gatekeeper.
2) Extend tests for branch/commit/CI paths.
3) Ensure guardrail references Gatekeeper (doc or code).
4) Critics/guardrail/tests run; commit/push.

## Risks/Mitigations
- Hook placement impacts existing workflows -> keep optional/configurable, clear messaging.
- LOC/file limits -> keep changes minimal.
- Repo dirtiness may block commit:check -> document, avoid touching external files.

## Out of Scope
- Broad refactors beyond immune integration.
