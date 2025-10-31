## Spec: Guardrail PR Documentation

### Deliverables
- `state/evidence/AT-GUARD-PR/pr/summary.md` capturing:
  - Problem statement & scope
  - Key remediation steps (CI workflow changes, new scripts, evidence backfill)
  - Verification evidence with file/command references
  - Monitoring/next-step commitments
- Phase evidence updates (`plan`, `think`, `implement`, `verify`, `review`, `monitor`) summarizing decisions per work-process stage.
- Links to supporting artifacts:
  - `.github/workflows/ci.yml` diff (ts loader guard)
  - `tools/wvo_mcp/scripts/check_ci_ts_loader.ts` + tests
  - `tools/wvo_mcp/scripts/run_integrity_tests.sh` guard additions
  - `state/automation/*` reports generated in this loop
  - Evidence directories for AT-GUARD-TS-LOADER-GATE, AT-GUARD-ZERO-BACKLOG, META-GUARD-SELF-CORRECT

### Acceptance Criteria Alignment
- Exit criteria demand PR summary with spans/metrics evidence and ledger references → include explicit bullet with artifacts + ledger hash mention (commit ID references).
- Provide table of verification commands executed in this loop so reviewers can replay if necessary.
- Document monitoring plan referencing `state/automation/evidence_backfill_report.json` and guard scripts for ongoing checks.

### Out of Scope
- Re-running heavy suites beyond those already executed (only re-verification if gap discovered).
- Editing guardrail code; documentation only.
- Broader architectural documentation (handled by AT-ARCH tasks).
