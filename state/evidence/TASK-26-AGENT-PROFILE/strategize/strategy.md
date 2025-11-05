# STRATEGIZE — Task 26: AGENT-PROFILE

## Problem framing
- Wave 3 requires adaptive agent analytics to unlock competency-based task routing; today we only log raw task outcomes (Task 13).
- Without profiling, orchestrator assigns work blind to agent strengths, violating SCAS qualities (#7 heterogeneity, #14 adaptation rate, #16 meta-learning).
- Task scope spans backend analytics, dashboards, and integration; ensuring maintainability and avoiding bloat is critical.

## Why now
- Downstream Wave 3 tasks (bias detection, adaptive feedback) assume agent capability insights.
- Recent stabilization reset the repo; clean baseline allows us to design the profiling architecture once the toolchain is rebuilt.
- Delay keeps allocation manual, reducing autonomy and learning velocity.

## Desired end-state
- Declarative profiler producing `AgentProfile` records backed by logged outcomes.
- Dynamic budget allocator and task allocator consume profiles for routing.
- Dashboards + APIs expose performance, learning curves, and skill gaps.
- Automated updates (CLI + CI) keep profiles current.

## Strategic options considered
1. **Full implementation as spec’d (preferred)** — Build modular analytics layer with incremental evidence. Requires functioning Node/TS toolchain.
2. **Lightweight reporting only** — Generate static analytics offline. Rejected; fails to integrate with orchestrator and dynamic allocation.
3. **Wait for toolchain fix before analysis** — Not acceptable; we must prepare design so implementation can begin immediately once environment unblocked.

## Kill / pivot triggers
- Toolchain (Node 24) remains unable to compile native deps (`better-sqlite3` headers missing). Without fix, implementation/verification cannot start.
- Task outcomes dataset incomplete or schema drifted. Need to validate before coding.
- If profiling scope proves too large for one task, split into analytics core vs. dashboards; reassess after SPEC/PLAN.

## Success measures
- Profiles for core agents (atlas, council, dana) recompute without manual edits.
- Allocation decisions demonstrably reference capability/efficiency metrics.
- Evidence artifacts (tests, dashboards, scripted verification) produced and reproducible.

## Immediate blockers / assumptions
- macOS Command Line Tools absent → `npm ci` fails. Must be resolved by host environment before IMPLEMENT.
- Need confirmation that `state/analytics/task_outcomes.jsonl` and phase logs exist post-reset.

## Next steps
- Proceed to SPEC to lock scope, document blockers, and prep plan contingent on toolchain restoration.
