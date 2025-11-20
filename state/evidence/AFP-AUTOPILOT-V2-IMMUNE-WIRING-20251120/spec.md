# SPEC - AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120

**Phase:** SPEC

## Acceptance Criteria (Must)
- Gatekeeper invoked on push/commit path to block protected branches, enforce commit regex, and run CI gate.
- Tests exist and pass for branch/commit/CI gates.
- Wave0 dry-run not blocked by stale locks: lock file is auto-cleaned if PID dead or older than TTL; live locks still block.
- Guardrail monitor (or equivalent) includes Gatekeeper or documented linkage.
- Evidence/critics complete; branch pushed.

## Should
- Clear messaging on block/allow and configuration.
- ≤5 files, ≤150 net LOC per batch; no new deps.
- Wave0 lock TTL configurable; safe messages when lock present.

## Could
- Configurable protected branches/CI command via env.
- Expose lock status helper for observability.

## Functional Requirements
- FR1: Hook/integration calls Gatekeeper.validatePush for current branch.
- FR2: validateCommitMessage enforced in workflow/hook.
- FR3: runCiGate callable in CI/pre-push path (can be configurable).
- FR4: Tests cover pass/fail paths for all gates.
- FR5: Wave0 lock handling detects stale PID or expired TTL and removes lock before run.

## Non-Functional
- Minimal surface area; logs actionable.
- No reliance on manual lock deletion; fallback behavior documented.
