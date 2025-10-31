## Implementation Notes
- Added `check_ci_ts_loader.ts` with reusable helpers (`analyseWorkflow`, CLI parsing, direct-execution guard).
- Exported helpers for testability and added vitest coverage in `scripts/__tests__/check_ci_ts_loader.test.ts`.
- Updated `.github/workflows/ci.yml` and `run_integrity_tests.sh` to invoke the guard and ensure `state/automation` artifacts exist.
- Bumped documentation (`WORK_PROCESS.md`, `TOOLBOX.md`) to reference the mandatory loader check.
