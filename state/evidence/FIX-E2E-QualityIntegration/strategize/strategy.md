# Strategy — FIX-E2E-QualityIntegration

## Why now?
- WorkProcessQualityIntegration now has strong unit coverage (FIX-TEST-QualityIntegration), but we still lack integration evidence that WorkProcessEnforcer actually invokes quality checks at the correct phases with the expected side effects.
- Mission 01 autonomy goals require proof that the orchestrated phase transitions (STRATEGIZE→MONITOR) respect quality gates; without automated E2E coverage, regressions could silently bypass enforcement.
- Upcoming error-handling and performance tasks rely on an integration harness that exercises real runner flows—this task lays the groundwork by validating `WorkProcessEnforcer` ↔ `WorkProcessQualityIntegration` wiring end-to-end.

## Problem statement
Unit tests confirm the integration class behaves correctly in isolation, but they do not ensure:
- Phase runners call quality checks in the right order.
- Blocking behaviour in `enforce` mode actually prevents state advancement.
- Telemetry emitted at orchestration level (e.g., recordProcessRejection, analytics logs) remains intact.
- Workspace/evidence mutations occur as expected when quality failures occur in real flows.

## Strategic goals
1. Build an integration harness that spins up WorkProcessEnforcer with a configurable quality integration and synthetic tasks, allowing phase transitions to be executed programmatically.
2. Verify both passing and failing scenarios across modes (`observe`, `enforce`).
3. Ensure telemetry and recordProcessRejection are triggered appropriately when checks fail.
4. Keep runtime small enough for CI (seconds, not minutes). Reuse or adapt existing test fixtures where practical.

## Options explored
| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Enhance existing smoke test with more assertions | Minimal work | Still shallow; doesn’t exercise phase transitions or blocking |
| B | Create new Vitest integration suite that drives WorkProcessEnforcer through sample phase runs | Full coverage, reusable harness | Requires more setup (mock tasks, scripts) |
| C | Use end-to-end CLI invocation (enforcement:rollout etc.) | Closest to production | Slower, heavy dependencies, harder to control deterministic outputs |

We choose **Option B** to balance realism and maintainability: instantiate WorkProcessEnforcer with fake runners/commands, run through transitions, and assert blocking + telemetry.

## Success signals
- Integration test reproduces both success and failure flows, asserting that monitor/verify runs respect blocking rules.
- Telemetry JSONL feeds (quality_gates_checks, etc.) contain entries emitted via WorkProcessEnforcer path.
- `recordProcessRejection` (or equivalent) is exercised when a check fails in enforce mode.
- Evidence captured, roadmap task set to `done`, and integration tests run quickly.

## Risks
- Complexity of mocking WorkProcessEnforcer dependencies (state graph, metrics) could lead to brittle harness.
- Test flakiness if relying on real timers/spawns—need deterministic scripts similar to unit tests.
- Overlap with future E2E tasks; ensure harness remains extensible.

## Mitigations
- Reuse existing in-memory state graph helpers (if available) or construct minimal runner pipeline.
- Keep scripts deterministic and use short timeouts to avoid flake.
- Document harness helpers so subsequent tasks can extend.
