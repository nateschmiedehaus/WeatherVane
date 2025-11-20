# THINK - AFP (Meta)

## Edge Cases (10)
1) Urgency override requests to skip phases -> remediation task required; block commit until evidence complete.
2) Guardrail failures from unrelated build debt (missing modules) -> isolate, log in monitor, rerun after fix.
3) Stale daily audit (>24h) -> guardrail fail; rerun audit and re-run guardrail before commit.
4) Wave0 locks/missing assets -> dry-runs blocked; record lock, open controlled restart task, no manual deletion.
5) commit:check noise from shared dirtiness -> document ownership; avoid touching; coordinate cleanup.
6) Mis-tagged evidence (wrong TASK-ID) -> risk lost traceability; use metadata.json and restage correctly.
7) Critics offline (network/tooling) -> pause implementation, log outage, rerun before commit.
8) Auto-generated large diffs (formatters, vendors) -> break micro-batching; split tasks, prefer deletion/simplification.
9) Encoding or path issues (non-UTF8, moved templates) -> critic scripts fail; detect, convert, adjust paths.
10) Time drift/clock skew -> stale checks miscomputed; treat future timestamps as stale, rerun audits.

## Failure Modes (10)
1) BP001 partial phases -> ProcessCritic + mid_execution_checks; remediation tasks; block commit.
2) Superficial evidence -> critics enforce depth; remediation if flagged.
3) Guardrail bypass (`--no-verify`) -> treat as violation; audit hooks; remediation task.
4) Wave0 omitted on autopilot changes -> VERIFY fail; require in PLAN; rerun or remediate.
5) Dirty repo hides regressions -> commit:check/guardrail; coordinate owner cleanup.
6) Locks deleted to “fix” blockers -> runtime corruption; forbid; controlled restart only.
7) Evidence not force-added -> missing history; enforce git add -f; pre-commit checks evidence presence.
8) Metrics not tracked -> blind spots; write phase KPIs/guardrail logs; review guardrail_compliance.jsonl.
9) Template drift (missing sections) -> critic failures; keep templates updated; run reviewers early.
10) Over-limit files/LOC -> pre-commit blocks; split tasks; via negativa first.

## Assumptions (12) with risk/mitigation
1) Files UTF-8; if not, critic parse fails -> detect/convert.
2) Evidence path `state/evidence/<TASK>/` writable; if not, create dirs; log errors.
3) Critics available; if down, pause IMPLEMENT; rerun before commit.
4) Guardrail monitor required for readiness; if skipped, treat as failure; rerun.
5) Daily audit must be <24h fresh; if stale, rerun audit.
6) Wave0 dry-run required when touching autopilot; if lock, record and plan restart.
7) Micro-batching applies to non-evidence files; if exceeded, split tasks.
8) commit:check reflects global hygiene; if dirty, document and coordinate.
9) Templates present under docs/templates; if moved, update paths.
10) Time sync reasonable; if skewed, treat timestamps conservatively (stale) and rerun checks.
11) Hook scripts (check_doc_edits, critics) exist; if missing, restore or stub and document.
12) No new deps for evidence/critics; if required, document and seek approval.

## Complexity Analysis
- Essential: disciplined 10-phase evidence + critics + guardrails; integration across critics/guardrail/audit hooks.
- Accidental risks: template drift, evidence sprawl, hook failures. Keep docs small but complete; run reviewers early.
- Cyclomatic/cognitive: low code but high process coordination; multiple scripts (critics, guardrail, audits, wave0).
- Integration: touches critic runners, guardrail monitor, commit hooks, wave0; outages stop pipeline.

## Mitigation Strategies (prevention/detection/recovery)
- Prevention: enforce templates; mid_execution_checks; mandate guardrail + audit + wave0 (when applicable); evidence force-add; micro-batching.
- Detection: critics (strategy/design/thinking/process/tests), guardrail monitor, commit:check, audit freshness, wave0 logs, KPI/log review.
- Recovery: remediation tasks for bypass; rerun audits/guardrail; reload templates; controlled restart for wave0; coordinate hygiene cleanup with owners.

## Testing Strategy (10+)
1) Verify evidence files exist per phase before commit (ProcessCritic).
2) guardrail monitor run passes (after fresh audit).
3) commit:check to capture hygiene/dirty state.
4) wave0 dry-run when autopilot touched (capture lock/missing asset).
5) Critics: strategy/design/thinking for task (already running) + resolve concerns.
6) Template availability test: docs/templates present; critic run succeeds.
7) Evidence force-add check: git status shows evidence staged.
8) Hook presence: check_doc_edits stub present; critics runnable.
9) Audit freshness check: latest audit <24h (verified via guardrail).
10) Micro-batching adherence: git diff --stat to ensure ≤5 non-evidence files/≤150 LOC per batch.

## SCAS / Paranoid Scenarios
- Feedback: critics + guardrail + commit:check + wave0.
- Redundancy: evidence + critics + guardrails + audits + live runs.
- Visibility: monitor/context logs for locks, dirtiness, outages.
- Adaptation: remediation tasks for bypass/tooling failures; template updates.
- Paranoid: hooks disabled, locks deleted, evidence skipped → treat as incident; restore hooks, recreate evidence, remediation task.

## Worst-Case Narrative
If critics are skipped and guardrails bypassed, a broken autopilot change could merge while wave0 is locked, hiding regressions. Recovery: freeze pushes, restore locks, rerun guardrails/wave0, recreate evidence, open remediation for each bypass, coordinate hygiene cleanup.

## Metrics / Observability
- % tasks with full 10-phase evidence + critic approvals.
- Audit freshness age; guardrail pass rate; commit:check hygiene counts.
- Wave0 run/lock status; number of remediation tasks opened.
- Hook/critic failure rates; evidence staging completeness.

## Decisions / Trade-offs
- Lock respect over speed; no manual deletion.
- Evidence completeness over brevity; critics enforce depth.
- Micro-batching vs throughput: split tasks instead of stretching limits.

## Coupling/Complexity Risks
- Multiple scripts (critics/guardrails/audits) can block work; outages must be documented and rerun before commit.
- Evidence sprawl risk; mitigate with metadata.json and context updates.
- Shared dirtiness requires owner coordination; avoid unilateral cleanup.
