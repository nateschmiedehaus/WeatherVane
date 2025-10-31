# Phase -1 Guardrail Remediation Summary

## Motivation
Phase -1 guardrail enforcement regressed when CI executed TypeScript scripts without a loader, which silently disabled several governance checks. Guardrail evidence also drifted (missing STRATEGIZE→MONITOR folders, stale automation outputs), producing recurring review audit failures. This PR bundle closes the loop by restoring the `tsx` loader path, aligning integrity and CI stages, and hardening evidence hygiene so guardrail tasks never defer remediation.

## What Changed
- **CI Workflow** (`.github/workflows/ci.yml`)
  - Inserts roadmap schema/evidence validators and the **CI TypeScript loader guard** before other enforcement stages.
  - Runs improvement audit, structural policy, risk-oracle, PR metadata, and architecture checks with shared arguments.
- **Integrity Harness** (`tools/wvo_mcp/scripts/run_integrity_tests.sh`)
  - Mirrors the loader, structural, risk, and PR metadata guards to keep CI ↔ integrity parity.
- **Guardrail Tooling**
  - Added `tools/wvo_mcp/scripts/check_ci_ts_loader.ts` with vitest coverage to fail on any `.ts` invocation lacking `--import tsx` / loader.
  - Added `tools/wvo_mcp/scripts/backfill_evidence_dirs.ts` (exposed via `npm run evidence:backfill`) to generate STRATEGIZE→MONITOR evidence folders and README placeholders for legacy tasks.
- **Evidence Bundles**
  - New work-process evidence for:
    - `AT-GUARD-TS-LOADER-GATE` (CI loader guard design + verification)
    - `AT-GUARD-ZERO-BACKLOG` (structural/risk/PR remediation sweep)
    - `META-GUARD-SELF-CORRECT` (policy/toolbox updates)
  - Legacy guard tasks now include verify notes explaining historical context (`FIX-TEST-MCP-Timeout`, `FIX-AUDIT-ImprovementReview`, `FIX-ORACLE-Coverage`, `FIX-DEP-Python-Idna`, `INVESTIGATE-VITEST-Failures`).

## Verification Evidence
| Command | Purpose | Evidence |
| --- | --- | --- |
| `npm --prefix tools/wvo_mcp run test -- check_ci_ts_loader` | Ensures loader guard vitest suite passes | `state/evidence/AT-GUARD-TS-LOADER-GATE/verify/results.md` |
| `npm run validate:roadmap` | Confirms roadmap schema consistency | `state/evidence/AT-GUARD-ZERO-BACKLOG/verify/results.md` |
| `npm run validate:roadmap-evidence -- --json` | Confirms every task has STRATEGIZE→MONITOR evidence | `state/evidence/AT-GUARD-ZERO-BACKLOG/verify/results.md` |
| `node --import tsx tools/wvo_mcp/scripts/run_review_audit.ts --quiet --output state/automation/audit_report.json` | Review automation gate | `state/automation/audit_report.json` |
| `INTEGRITY_SKIP_PYTHON_BOOTSTRAP=1 bash tools/wvo_mcp/scripts/run_integrity_tests.sh` | Full parity run (includes new loader guard) | logged in `state/evidence/AT-GUARD-ZERO-BACKLOG/verify/results.md` |
| `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task AT-GUARD-TS-LOADER-GATE` | Ensures STRATEGIZE→MONITOR evidence complete | `state/evidence/AT-GUARD-TS-LOADER-GATE/verify/results.md` |
| `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task AT-GUARD-ZERO-BACKLOG` | Evidence completeness for guardrail sweep | `state/evidence/AT-GUARD-ZERO-BACKLOG/verify/results.md` |
| `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task META-GUARD-SELF-CORRECT` | Evidence completeness for policy update | `state/evidence/META-GUARD-SELF-CORRECT/verify/results.md` |

Key automation artifacts captured under `state/automation/`:
- `audit_report.json`
- `structural_policy_report.json`
- `oracle_coverage.json`
- `pr_metadata_report.json`

## Monitoring & Follow-up
- **Evidence backfill**: Run `npm run evidence:backfill` whenever new roadmap tasks are added or migrated. Output is tracked locally (`state/automation/evidence_backfill_report.json`, gitignored) and should be retained in verification evidence when updates occur.
- **CI/Integrity parity**: Loader guard and enforcement stages are now identical in CI and the integrity harness. Future guardrail changes must update both surfaces.
- **Policy alignment**: WORK_PROCESS & TOOLBOX documents reference the loader guard and evidence backfill procedure (via `META-GUARD-SELF-CORRECT`). Reviewers should ensure new tasks cite these requirements.

## References
- Commit: `09291a02d934d9ee08d7d0a08496499b3c156577`
- Evidence directories:
  - `state/evidence/AT-GUARD-TS-LOADER-GATE`
  - `state/evidence/AT-GUARD-ZERO-BACKLOG`
  - `state/evidence/META-GUARD-SELF-CORRECT`
- Key scripts:
  - `.github/workflows/ci.yml`
  - `tools/wvo_mcp/scripts/check_ci_ts_loader.ts`
  - `tools/wvo_mcp/scripts/run_integrity_tests.sh`
  - `tools/wvo_mcp/scripts/backfill_evidence_dirs.ts`
