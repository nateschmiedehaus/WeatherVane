# Think — Analysis & Risk Review

## Current coverage snapshot
- Constructor tests already exist for missing and non-executable scripts, but they only assert the error starts with the expected phrase—no guarantee the remediation guidance remains.
- Timeout and SIGKILL handling are covered, yet we can extend assertions to ensure the process is actually terminated (no leftover PID) and that timedOut flag is set.
- JSON parse errors are validated, but telemetry logging (`logQualityCheckEvent`) lacks resilience tests (ENOSPC, EACCES).

## Gaps to close
1. **Message fidelity** — confirm builder errors surface run-book hints (lack of assertion today).
2. **Telemetry resilience** — simulate disk full by forcing `fs.appendFileSync` to throw ENOSPC and ensure `logError` fires without rethrow.
3. **Regression guard** — ensure tests fail if developers strip remediation text or accidentally rethrow telemetry errors.

## Approach considerations
- Use `vi.spyOn(fs, 'appendFileSync')` with `mockImplementationOnce` to throw ENOSPC. Restore spy in `finally` to avoid polluting other tests.
- Spy on `logError` via `import * as logger from '../../telemetry/logger.js'`.
- Keep tests deterministic by avoiding reliance on actual disk conditions.

## Risks & mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Spy leakage into other tests | Flaky suite | Restore spies in `afterEach` / `finally` blocks |
| Tight coupling to string messages | Future copy updates may break tests | Assert on key substrings (e.g., `'Run WORK-PROCESS-FAILURES task'`, `'chmod +x'`) rather than full string |
| Timeout tests still slow | Could slow CI | Reuse existing short-duration helpers; avoid long sleeps |
| Telemetry failure test may swallow other errors | Hard to debug real regressions | assert `logError` called exactly once with ENOSPC payload |

## Dependencies
- `work_process_quality_integration.ts` (implementation under test)
- Metrics collector + logger modules (`../../telemetry/logger.js`)
- Node filesystem for script fixtures

## Open questions
- Do we need to assert SIGTERM→SIGKILL specifically beyond timedOut flag? For now, verifying `timedOut` + exit ensures behaviour; deeper process inspection may be overkill.
- Should we add WorkProcessEnforcer-level coverage for telemetry failure? Probably unnecessary—unit test suffices and keeps scope tight.

