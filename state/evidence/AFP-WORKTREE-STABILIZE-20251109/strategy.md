# Strategy — AFP-WORKTREE-STABILIZE-20251109

## Why now
- Current branch `task/AFP-RESOLVE-AND-ADVANCE-20251111` carries ~12k dirty paths captured by earlier git status; large diff blocks any ability to verify or extend Wave 3 tasks.
- MCP tooling fails to build because prior guardrails prevented worktree cleanup; policy update authorizes a stabilization pass so AFP/SCAS loops can resume.
- Without a clean baseline we cannot trust tests, evidence, or gate outputs, violating Complete-Finish and AFP enforcement mandates.

## Desired end state
- Dirty state archived with full lineage (status + diff, branch/tag, tarball) for forensic recovery.
- Local repo reset to origin/main with deterministic clean status.
- Volatile artifacts quarantined; scan exclusions documented to prevent rebuild loops.
- MCP toolchain rebuilt, restart scripts runnable, and integrity guards ready for later remediation work.

## Strategic options considered
1. **Do nothing** — rejected; leaves orchestrator unusable and blocks Wave 3 tasks indefinitely.
2. **Partial cleanup (selective file resets)** — rejected; impossible to reason over 12k files and would leave hidden drift.
3. **Full AFP-guided stabilization (archive + reset + quarantine)** — chosen; aligns with new policy, preserves evidence, and re-establishes trustworthy baseline.

## Kill / pivot triggers
- If snapshot creation fails (branch/tag/write) or tarball exceeds filesystem capacity → pause and reassess storage plan.
- If repo permissions prevent reset/clean → escalate for ownership fix before proceeding.
- If MCP build continues to fail after toolchain install → pause stabilization until toolchain dependency is unblocked (may require environment change).

## Integration considerations
- Snapshot artifacts will live under `state/backups/` and may be large; ensure scan exclusions prevent re-ingestion by future scans/tests.
- Git notes/tag naming must remain unique to avoid clashing with other stabilization runs.
- Evidence in `state/evidence/AFP-WORKTREE-STABILIZE-20251109` must be kept small enough for PR attachments while still satisfying AFP audit trail.

## AFP worthiness check
- Restoring clean STRATEGIZE→MONITOR loop is prerequisite for adaptive-feedback roadmap; effort justified because every subsequent task depends on a stable baseline.
- Alternative “wave continuation” without cleanup would violate enforcement and risk corrupting evidence, so this stabilization task remains highest priority.
