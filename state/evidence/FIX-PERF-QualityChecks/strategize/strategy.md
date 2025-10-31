# Strategy — FIX-PERF-QualityChecks (Rev 2)

## Mission Alignment / Why Now
- WorkProcessQualityIntegration is now wired into the autonomous loop; autonomy depends on quality gates executing inside strict SLOs (<30 s preflight, <15 s gates, <20 s reasoning at p95). Caching + telemetry shipped in the previous slice, but preflight still takes ~160 s on a clean workspace, forcing operators to bypass guardrails when they are under pressure.
- The roadmap keeps this task open because the slow shell-based preflight remains the critical blocker for Mission 01 “Phase 0 instrumentation” to prove real-time guardrails are practical. Until we solve the first-run latency, autonomy still depends on human patience.

## Reality Check (Current State)
- ✅ Caching layer, metrics, and benchmark harness have landed; repeated runs skip work and show healthy latency for quality gates (≈11 s) and reasoning (<1 s).
- ⚠️ First-run preflight is still a 160 s sequential bash script (`scripts/preflight_check.sh`) that runs `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck`, regardless of the change surface. Caching cannot shorten the initial run, so p95 remains far above target for new branches or clean checkouts.
- ⚠️ A modern TypeScript `PreflightRunner` exists, but WorkProcessQualityIntegration and the shell script do not use it. We maintain two divergent implementations, and the optimized runner logic (git signature, anti-flap counters) never executes.
- ⚠️ Operators lack clear documentation on preflight scope. The shell script performs heavyweight scans even when no relevant files change, encouraging manual skips that undermine safety.

## Updated Desired End State
1. **Unified implementation**: The TypeScript runner becomes the single source of truth, reachable both from WorkProcessQualityIntegration and the legacy shell entrypoint. Manual and autonomous paths share telemetry, logging, and decision logic.
2. **Change-aware execution**: Preflight inspects git status + diffs to determine which checks are necessary. Examples:
   - Python diff ⇒ run `ruff` (non-blocking, via `--exit-zero`).
   - Frontend/TypeScript diff ⇒ run Next lint + project typecheck.
   - Autopilot core diff ⇒ run a fast vitest smoke (e.g., orchestrator enforcement suite).
   - If operators want the legacy suite they can pass `--full`; otherwise scoped mode stays fast.
3. **SLO compliance**: First-run preflight finishes <30 s p95 on a clean machine while preserving meaningful coverage. Heavy suite remains available behind `--full` or env flag.
4. **Operational clarity**: Benchmarks are refreshed, timeouts tuned with ≥20 % headroom, and documentation teaches operators how scope detection works, how to force a full run, and how caching interacts with the new runner.

## Deep Strategic Options (Re-evaluated)
1. **Leave script as-is + rely on caching** — fails p95 goals; first-run still ~160 s. Not acceptable for autonomy.
2. **Rewrite everything in TS from scratch** — high accuracy but too costly; we already have `PreflightRunner`, so rewrite would duplicate work.
3. **Incremental diff-based shell optimizations** — hard to maintain, limited introspection, duplicates logic between bash and Node.
4. **Unify on TypeScript runner + smart scoping** — leverages existing class, easier to extend, provides structured metrics, and centralizes policy. Chosen.
5. **Aggressive parallelism** — possible future enhancement, but scoping + smarter commands promise larger gains with less risk.

## Chosen High-Level Approach
1. **Ship a CLI wrapper for `PreflightRunner`** (tsx entrypoint). It parses `--task`, `--source`, `--full`, and emits a JSON summary for WorkProcessQualityIntegration + manual usage.
2. **Route legacy shell script through the CLI** for compatibility while keeping the old UX; WorkProcessQualityIntegration’s config switches to the Node entrypoint.
3. **Implement scope detection**:
   - Build a diff classifier that buckets changes into PY / TS / Autopilot core.
   - Skip commands whose bucket is untouched; the CLI surfaces the file list so operators can decide when to rerun with `--full`.
4. **Curate fast smoke commands**:
   - Replace the heavy suite with targeted commands (ruff `--exit-zero`, Next lint/typecheck, vitest smoke).
   - Allow optional `--full` flag to run the historical suite for debugging/CI parity.
5. **Benchmark + tune** — re-run the harness against the new CLI to capture post-change timings, adjust default timeouts with a 20 % buffer, and log the new SLO compliance in evidence.
6. **Document + observe** — update WORK_PROCESS + troubleshooting docs, add metric tags for the new scope categories, and ensure `check_performance_regressions.ts` alerts on future drift.

## Risks & Kill Triggers
- **Scope detector misses critical files** → include conservative rules and surface changed files in output. Operators can force `--full` if scope looks suspicious.
- **Smaller smokes miss issues** → vitest smoke remains deterministic; document when to escalate to full suite.
- **CLI drift across environments** → rely on tsx (already used) and keep shell wrapper to maintain compatibility. Abort if the CLI approach breaks manual workflows.
- **Latency still >30 s** → if after optimisation we cannot hit targets on clean machines, reassess command set or consider parallelisation.

## Stage Interfaces (Next Phases)
- **SPEC**: Redefine acceptance criteria around unified CLI, scope detection rules, and new timeout targets; update deliverable list.
- **PLAN**: Split work into CLI creation, scope detection, command tuning, integration change, benchmarking, and docs.
- **THINK**: Deep dive into failure modes (stale diff cache, missing deps, concurrency) and refresh risk oracle map to cover “preflight scope mis-detected”.
- **IMPLEMENT**: Build CLI + detection, adjust configs, add tests (unit + integration) proving selective execution.
- **VERIFY**: Re-run benchmarks, performance regression checker, determinism, structural policy, etc., and capture new evidence.
