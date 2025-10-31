# THINK — Analysis

## Failure Modes & Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Tests misinterpret fail-safe logic (treating exit code = failure) | False positives; blocks deployments | Use logical failure script (exit 0, `passed:false`) vs. crash script to distinguish behaviours |
| Timeout tests flake on slow CI | Noise, reruns | Keep timeout threshold generous (e.g., 500ms) and sleeping script >2s; assert duration < 1.5s |
| Telemetry assertions brittle due to prior runs | Flaky checks | Use fresh temp workspace per test; remove analytics dir to test recreation |
| Shell scripts leave residues | Disk clutter, interfering runs | Delete temp workspace (`fs.rmSync`) in `afterEach` |
| Platform differences (linux vs mac) | Inconsistent behaviour | Stick to POSIX sh features; avoid GNU-only flags |

## Implementation Notes
- `MetricsCollector` can be instantiated with temp workspace; no external dependencies triggered.
- For timeout escalation, rely on spawn + manual kill; verifying absence of zombie process via `timedOut` flag + duration is sufficient.
- Telemetry ensures append; tests should read last JSONL entry (trim newline) and parse.
- Use Vitest`s `vi.useFakeTimers` unnecessary since real timers provide stronger signal; rely on actual time measurement.
- Keep helper functions at bottom of test file; avoid duplication across tests.

## Additional Considerations
- Ensure import path uses `.js` extension (ESM compiled output) in tests (existing style).
- When making analytics dir read-only to force failure, reset permissions afterwards to allow cleanup.
- Guard against path resolution by using `path.resolve` with workspace root.
