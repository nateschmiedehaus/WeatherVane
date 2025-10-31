## Spec: CI loader guard

### Scope
- Implement `tools/wvo_mcp/scripts/check_ci_ts_loader.ts` to parse `.github/workflows/ci.yml` and flag TypeScript commands executed without a Node loader.
- Add vitest coverage for multi-line and inline run variants.
- Invoke the guard from CI and from `run_integrity_tests.sh`.

### Acceptance criteria
- Guard exits non-zero when encountering a `.ts` command lacking `--import tsx`, `npx tsx`, or another loader token.
- CI workflow runs the guard after roadmap validation.
- Integrity harness runs the guard before web vitest and reports failures in the summary table.
- Evidence folder captures strategy→monitor artifacts and guard output.
