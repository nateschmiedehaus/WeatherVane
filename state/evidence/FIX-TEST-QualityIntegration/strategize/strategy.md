# Strategy — FIX-TEST-QualityIntegration

## Why now?
- WorkProcessQualityIntegration drives the zero-deferral quality mandate; without deterministic unit tests we cannot prove fail-safe behaviour or mode switching before rolling into Phase 1 autonomy.
- Mission 01 instrumentation and documentation now reference these checks—lack of validated unit tests creates a credibility gap when the baseline flags regressions.
- Downstream tasks (E2E tests, error-handling coverage, performance benchmarking) depend on trustworthy unit-level guarantees that timeouts, script errors, and telemetry behave as specified.

## Core problem
Documentation and roadmap assume WorkProcessQualityIntegration blocks correctly in `enforce`, respects fail-safe settings, logs telemetry, and tears down hung processes. We currently rely on manual reasoning; existing test scaffolds are outdated and fail against the actual implementation (e.g., fail-safe blocking logic). We need authoritative, maintainable tests that exercise those behaviours across modes.

## Goals
1. Cover exit criteria in roadmap: timeout escalation, error parsing, mode logic, fail-safe defaults, telemetry logging, script validation.
2. Ensure tests model real scenarios (JSON failure vs. script crash) so that fail-safe behaviour is asserted accurately.
3. Produce fixtures that run quickly (<1s) to keep enforcement suite performant.
4. Capture evidence + roadmap metadata so autopilot treats the task as complete.

## Approach options
| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A | Patch existing brittle tests with minimal edits | Fast | Keeps flawed assumptions (exit code handling), risk of flake |
| B | Rewrite comprehensive Vitest suite with deterministic helpers | Aligns with implementation, clear coverage | Slightly more effort |
| C | Mock child_process instead of spawning scripts | No shell scripts | Less realistic; misses signal/timeout behaviour |

We choose **Option B**: run real short-lived shell scripts in a temp workspace so timeout and file-system interactions remain faithful while keeping runtime low.

## Success signals
- Vitest suite `work_process_quality_integration.test.ts` passes reliably and covers all roadmap exit criteria.
- Tests distinguish between JSON-based failures and process errors/timeouts, matching fail-safe semantics.
- Telemetry files appear under `state/analytics` during tests and are asserted.
- Roadmap task marked `done` with evidence path populated.

## Open questions / constraints
- Ensure temp workspace cleanup to avoid clutter.
- Confirm tests run under both Node 20+ and CI environment (no platform-specific bash features).
- Leverage existing MetricsCollector without hitting external services.
