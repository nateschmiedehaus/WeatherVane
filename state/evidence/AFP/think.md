# THINK - AFP (Meta)

**Date:** 2025-11-20  
**Author:** Codex

## Edge Cases
1) **Urgency override requests** — people want to skip phases. *Mitigation:* require formal remediation task; no shortcuts.  
2) **Guardrail failures from unrelated build debt** — e.g., missing modules. *Mitigation:* isolate root cause, log in monitor, rerun after fix.  
3) **Stale daily audit (>24h)** — causes automatic guardrail fail. *Mitigation:* add audit to VERIFY for every AFP task until fresh.  
4) **Wave0 locks/missing assets** — dry-runs blocked. Do not delete locks; log and open remediation.  
5) **commit:check noise from shared dirtiness** — avoid touching owner files; document and coordinate.  
6) **Mis-tagged evidence** — wrong TASK-ID in evidence. *Mitigation:* metadata.json per task; restage correctly.  
7) **Critics offline** — tooling failure. *Mitigation:* pause implementation, rerun when back, note outage in monitor.  
8) **Auto-generated large diffs** — risk breaking micro-batching. *Mitigation:* split tasks/commits; delete/simplify first.

## Failure Modes
1) **BP001 partial phases** — trust loss. *Likelihood:* medium; *Impact:* high. *Mitigation:* ProcessCritic + mid_execution_checks + remediation tasks.  
2) **Superficial evidence** — templates without substance. *Likelihood:* medium; *Impact:* high. *Mitigation:* critics demand risks/tests, SCAS mapping.  
3) **Guardrail bypass (`--no-verify`)** — silent failures. *Likelihood:* low; *Impact:* critical. *Mitigation:* treat as violation; open remediation; audit hooks.  
4) **Wave0 omitted on autopilot changes** — live regressions. *Likelihood:* medium; *Impact:* high. *Mitigation:* require in PLAN; treat as VERIFY failure.  
5) **Dirty repo hides regressions** — commit:check warnings ignored. *Likelihood:* high; *Impact:* medium. *Mitigation:* document ownership, plan cleanup, rerun check.  
6) **Locks deleted to “fix” blockers** — corrupt runtime. *Likelihood:* low; *Impact:* high. *Mitigation:* forbid manual lock deletion; coordinate restart tasks.  
7) **Evidence not force-added** — missing history. *Likelihood:* medium; *Impact:* high. *Mitigation:* mandate git add -f and verify paths before commit.
8) **Metrics not tracked** — no signal on process health. *Likelihood:* medium; *Impact:* medium. *Mitigation:* write KPIs via telemetry (phase KPIs) and audit guardrail_compliance logs.

## Assumptions
- Critics (strategy/design/thinking/process/tests) are baseline; if unavailable, work pauses.  
- Evidence lives under `state/evidence/<TASK>/` and must be force-added.  
- Guardrail monitor + daily audit determine readiness; failures block merge.  
- Wave0 dry-run required when touching autopilot runtime.  
- Micro-batching rules apply to non-evidence files; evidence exempt but must be complete.  
- Remediation tasks opened for any bypass pattern detection.

**If assumptions break:**  
- Critics unavailable → postpone IMPLEMENT; document outage; rerun before commit.  
- Evidence path changes → risk of lost history; update guidance and restage.  
- Guardrail monitor stale → Treat as failure; open remediation.  
- Wave0 skipped → log as VERIFY failure; rerun or open remediation.

## Testing / Verification Approach
- Automated: `node tools/wvo_mcp/scripts/check_guardrails.mjs`, `node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run`, `npm run commit:check`, `npx vitest <target>` for touched modules.  
- Live: `npm run wave0 -- --once --epic=WAVE-0 --dry-run` when autopilot touched.  
- Critics: strategy/thinking/design/process/tests on every AFP task; rerun after edits.

## Risk / Detection / Mitigation Matrix
- **Partial phases (BP001):** detect via ProcessCritic + missing phase files; mitigate with remediation task + required reruns.  
- **Stale audit:** detect via guardrail monitor daily_audit_fresh; mitigate by running rotate_overrides + new audit evidence.  
- **Guardrail bypass:** detect via missing monitor output or `--no-verify` usage; mitigate with hook checks and retrospective remediation.  
- **Wave0 gaps:** detect via missing wave0 logs; mitigate with rerun or remediation task.  
- **Dirty repo:** detect via commit:check metrics; mitigate through owner coordination and staged cleanup tasks.

## Detection & Monitoring Signals
- Guardrail monitor output (pass/fail reasons).
- Daily audit freshness timestamp.
- commit:check counts (files/LOC/time since last commit).
- Wave0 run logs (lock, missing assets, runtime errors).
- Critic concern counts by task (strategy, design, thinking).

## SCAS / Paranoid Scenarios
- **Feedback:** critics + guardrail + commit:check + live runs.  
- **Redundancy:** evidence + critics + guardrails + audits + live tests.  
- **Visibility:** context/monitor capture locks, dirtiness, outages.  
- **Adaptation:** remediation tasks spawned for bypass/tooling failures.  
- **Paranoid:** hooks disabled, locks deleted, or evidence skipped → treat as critical incident; restore guardrails, open remediation, and audit commits.

## Open Questions / Follow-ups
- Should daily audit be automated on a schedule? (likely yes; add to roadmap).  
- How to handle shared dirty state without blocking unrelated work? (needs owner coordination playbook).  
- Should Wave0 locks auto-expire? (risk vs safety; prefer manual coordination).

## Worst-Case Narrative
If critics are skipped and guardrails bypassed, a broken autopilot change could merge to main while wave0 is locked, hiding regressions. Recovery requires: freeze pushes, restore locks, rerun guardrails/wave0, recreate evidence, and open remediation tasks for every bypass. This underscores why AFP meta artifacts and monitors must stay active.

## Metrics / Observability
- % tasks with full 10-phase evidence and critic approvals.
- Mean time since last daily audit (target <24h).
- Guardrail monitor pass rate; top failure reasons.
- commit:check hygiene stats (files/LOC/time).
- Wave0 run success/block reasons.

## Decisions / Trade-offs
- **Lock respect vs speed:** prefer safety; do not auto-remove locks.  
- **Evidence density vs brevity:** concise artifacts but no placeholders; critics enforce depth.  
- **Micro-batching vs throughput:** keep ≤5 non-evidence files/≤150 LOC per batch; split tasks rather than stretching limits.

## Coupling/Complexity Risks
- AFP meta depends on multiple scripts (critics, guardrails, audits); any tool outage halts pipeline. Mitigation: document outage, rerun, and avoid committing until green.  
- Evidence sprawl risk; mitigate with metadata.json per task and context updates.  
- Human coordination risk on shared dirtiness; mitigate with explicit owner ping and monitor notes.
