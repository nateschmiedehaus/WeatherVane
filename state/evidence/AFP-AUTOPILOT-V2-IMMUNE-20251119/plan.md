# PLAN - AFP-AUTOPILOT-V2-IMMUNE-20251119

**Date:** 2025-11-19  
**Author:** Codex

## Approach
- Refine `Gatekeeper` into a reusable immune component that enforces branch protection, commit hygiene, and CI gating with clear outcomes (allow/block) and actionable errors.
- Keep surface area small (≤5 files, ≤150 net LOC); no new deps.
- Update Architecture V2 Immune section to describe implemented behaviors and map SCAS characteristics to modules.
- Author tests now (Vitest) to codify the gates; VERIFY will run these tests.

## Files to Change
- `tools/wvo_mcp/src/immune/gatekeeper.ts` — implement branch/commit/CI enforcement with configurable options.
- `tools/wvo_mcp/src/immune/gatekeeper.test.ts` — new Vitest coverage for gates (branch, commit regex, CI success/failure).
- `tools/wvo_mcp/ARCHITECTURE_V2.md` — document Immune System implementation details and SCAS coverage.
- `state/evidence/AFP-AUTOPILOT-V2-IMMUNE-20251119/*` — phase evidence (existing/updated).

## PLAN-authored tests (to run in VERIFY)
- **Unit:** `cd tools/wvo_mcp && npm run test -- --runInBand --filter gatekeeper` (Vitest) covering:
  - validatePush blocks `main` and permits feature branches.
  - validateCommitMessage enforces regex acceptance/rejection cases.
  - runCiGate succeeds on command exit 0 and fails on non-zero.
- **Git Hygiene Check:** `cd tools/wvo_mcp && npm run commit:check` to ensure commit rules align (dry-run, no mutations).
- **Wave0 Live Step (autopilot touch):** `cd tools/wvo_mcp && npm run wave0 -- --once --epic=WAVE-0 --dry-run` to ensure immune changes don’t break loop. (If blocked, capture evidence and open remediation.)

## Milestones
1. Implement Gatekeeper enhancements with injected CI command + clearer errors.
2. Add Vitest coverage for branch/commit/CI logic.
3. Update Architecture V2 Immune + SCAS mapping.
4. Run tests (unit + commit:check + wave0 dry-run or capture block) and collect evidence.

## Risks / Mitigations
- **TS build friction** (noted earlier missing modules): keep changes isolated; run targeted tests instead of full build; document any build blockers.
- **ProcessCritic limits** (≤5 files/≤150 LOC): track diffs, avoid gratuitous text additions.
- **Wave0 run cost/time:** attempt dry-run; if blocked, record logs and open remediation note in VERIFY.

## Out of Scope
- Adding new dependencies or altering broader orchestrator routing.
- Changing git hooks beyond Gatekeeper module contract.
