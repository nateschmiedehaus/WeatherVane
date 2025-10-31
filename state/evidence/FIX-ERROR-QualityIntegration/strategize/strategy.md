# Strategy — FIX-ERROR-QualityIntegration

## Why now?
- WorkProcessQualityIntegration is already wired into WorkProcessEnforcer, but guardrail reviews flagged missing regression coverage for failure paths (script missing, non-executable, timeout escalation, invalid JSON, telemetry write failures). Without executable evidence, a regression could silently disable enforcement or mask telemetry gaps.
- Phase −1 guardrails depend on these checks to block risky transitions. Error-handling regressions would erode the guarantees we just restored (structural policy, risk oracles, integrity suite).
- This task completes the test backlog created by FIX-INTEGRATION-WorkProcessEnforcer and is the last open item before promoting quality integration to Tier 3 confidence.

## Root problem
Unit tests cover the integration class in isolation, but we lack explicit assertions that:
- Constructor errors surface actionable guidance (script not found / not executable).
- Timeout handling escalates to SIGKILL and leaves telemetry traces.
- Telemetry logging failures (e.g., disk full) are non-blocking yet observable.
The absence of these tests leaves high-risk branches unverified.

## Goals
1. Prove every documented error path produces actionable messaging (with run-book hints).
2. Ensure fail-safe behaviour (timeouts, malformed JSON, telemetry errors) remains non-blocking while still logging metrics.
3. Capture regression coverage in Vitest so the integrity suite can rely on these guarantees.

## Options considered
| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Leave coverage to existing unit tests | Zero work | Misses telemetry/ENOSPC path; doesn’t assert message content |
| B | Add E2E scenarios inside WorkProcessEnforcer | Higher fidelity | Slower; duplicates logic already validated at unit level |
| C | Extend WorkProcessQualityIntegration unit tests with targeted error cases (chosen) | Fast, deterministic, directly exercises error branches (constructor + runCheck + telemetry) | Requires careful mocking of filesystem/logger |

## Choice
Pursue **Option C**: extend unit suite with targeted error scenarios, plus light helper functions for fixtures. This keeps runtime minimal while giving precise assertions.

## Success criteria
- New tests cover: script missing, script non-executable, timeout escalation, invalid JSON, telemetry (ENOSPC) error.
- Assertions check for actionable text (`Run WORK-PROCESS-FAILURES`, `chmod +x ...`, etc.).
- Telemetry failure test proves result remains pass/fail as expected and `logError` captures the issue.
- Roadmap task moves to `done` with VERIFY evidence referencing commands.

## Risks & mitigations
- **Mocking fs** could bleed into other tests → restore spies each test and confine overrides.
- **Time-sensitive tests** flaky → use short sleeps and jest fake timers? Instead rely on existing helpers (sleep but with timeouts <1s) and reuse pattern from current suite.
- **Message coupling** may fail if copy changes → base assertions on key actionable substrings rather than entire string.

