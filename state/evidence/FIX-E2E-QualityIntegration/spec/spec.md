# Spec — FIX-E2E-QualityIntegration

## Objectives
- Verify WorkProcessEnforcer + WorkProcessQualityIntegration end-to-end by simulating phase transitions on a synthetic task.
- Cover both passing and failing scenarios across observe/enforce modes.
- Assert that telemetry and recordProcessRejection are triggered appropriately.

## Test Requirements
1. **Happy path (enforce mode)**: Quality checks pass; WorkProcessEnforcer advances through phases without rejection; telemetry and metrics recorded.
2. **Failing quality gate**: Inject failing script; ensure WorkProcessEnforcer blocks advancement, `recordProcessRejection` called, and telemetry shows failure.
3. **Observe mode**: Same failing script should not block but should log warnings and telemetry entries.
4. **Telemetry coverage**: Confirm analytics JSONL entries appended via integration path (not just unit-level).
5. **Workspace effects**: Ensure temporary evidence directories or markers are created as expected (if WorkProcessEnforcer writes to state).
6. **Speed & determinism**: Execution per scenario < 2s; scripts deterministic (no network).

## Approach
- Construct minimal harness using WorkProcessEnforcer with stubbed state runners that call quality integration at appropriate lifecycle points.
- Leverage in-memory queue or test double to simulate tasks; rely on deterministic shell scripts similar to unit tests.
- Use Vitest with beforeEach/afterEach for workspace setup/cleanup.
- Use spies/mocks to capture `recordProcessRejection` and logging impacts.
- Optionally reuse helpers from unit tests for script generation.

## Non-Goals
- Full CLI integration (handled by future tasks).
- Testing unrelated failure modes (covered by FIX-ERROR-QualityIntegration).
- Performance benchmarking (separate task).
