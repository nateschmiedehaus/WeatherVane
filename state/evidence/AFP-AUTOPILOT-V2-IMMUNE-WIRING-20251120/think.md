# THINK - AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120

## Edge Cases (8)
1) Empty/invalid branch name from hook → skip enforcement → block with clear guidance.  
2) Commit message first line blank or multi-line with leading newline → regex bypass → trim and validate first line only.  
3) CI command missing or typo → execa ENOENT → fail fast with stderr and guidance.  
4) CI command hangs (>timeout) → gate never returns → optional timeout + operator message to rerun with smaller suite.  
5) Protected branches beyond `main` (release/hotfix) → default misses policy → allow env override, add tests.  
6) Corrupt `.wave0.lock` JSON → parser throws → treat as stale, delete, recreate.  
7) Stale lock where PID reused by OS quickly → PID alive check + TTL window; allow TTL override for prod.  
8) Wave0 run killed mid-loop → lock remains → next start auto-cleans if PID dead/TTL expired; log reason.

## Failure Modes (6)
- Hook not invoked in workflow → no enforcement. Mitigation: make enforce_gatekeeper.mjs the canonical entry; add guardrail check to ensure invocation.  
- Overly strict commit regex → blocks valid messages. Mitigation: clear error copy with example; optional scope; keep lower-case policy documented.  
- CI gate false block from flaky test → surface stderr/exit code; allow re-run after fix; enable CI command override.  
- Lock cleanup misfires on live process → combination of PID-alive + TTL reduces risk; default TTL 30m matches lease.  
- Guardrail skipped via env → ensure guardrail monitor runs in CI; alert on missing run.  
- Dirty repo noise hides real issues → commit:check warnings documented; coordinate owner cleanup separately.

## Assumptions (12)
1) Node fs/path available; no EROFS on state dir.  
2) Default encoding UTF-8 for lock file.  
3) `kill(pid,0)` is supported; EPERM means PID likely alive.  
4) PID reuse window > TTL; otherwise operator can raise TTL.  
5) Vitest available via npx (tools/wvo_mcp dev deps installed).  
6) No new dependencies allowed; execa already present.  
7) Conventional commits policy (lowercase types) is desired.  
8) Protected branches start with `main`; release/hotfix passed via env if needed.  
9) Guardrail monitor remains authoritative in CI.  
10) Wave0 dry-run used for smoke; rate limit can be lowered via env.  
11) State root writable to create/delete lock files.  
12) No concurrent wave0 runs launched via other automation; if they are, lock prevents overlap.

## Complexity Analysis
- Essential complexity: lock TTL/PID checks + simple helper; gate invocation unchanged.  
- Accidental complexity: env knobs (TTL/rate limit) and logging; kept small.  
- Cyclomatic: resolveLockStatus branches for missing/corrupt/stale/active (~4).  
- Cognitive: helper name and fields self-explanatory; tests document intent.  
- Integration: touches wave0 runner and tests only; no deps or build config changes.

## Mitigation Strategies
- Prevention: guard inputs (branch/message/CI command), default TTL and rate limit, PID-alive check, env overrides.  
- Detection: console.error/info messages, guardrail monitor, vitest coverage, wave0 logs showing lock removal reason.  
- Recovery: stale/corrupt locks auto-removed; operators can rerun with adjusted TTL/rate-limit; CI failures surface stderr for retry; commit regex guidance to fix quickly.

## Testing Strategy (specific)
- Unit: resolveLockStatus → no lock, dead PID, expired TTL, live PID.  
- Unit: gatekeeper tests → branch block/allow, commit regex accept/reject, CI success/failure/missing command.  
- Integration: guardrail monitor run (process_critic + audit freshness).  
- System smoke: wave0 dry-run with stale lock present (should auto-clean) and with lowered rate limit to observe clean exit when no tasks.  
- Hygiene: commit:check to record dirty state warnings (expected).  
- Manual: inspect state/.wave0.lock after dry-run to confirm removal.

## Paranoid Scenarios (6)
1) PID reuse immediately after process exit → TTL + EPERM handling reduce accidental deletion; allow TTL increase.  
2) Stale lock persists due to permission error → detection via guardrail/wave0 log; recovery: operator fix perms, rerun.  
3) CI command set to destructive script → rely on existing gatekeeper CI command config and repo review; CI should be vetted.  
4) Hook skipped intentionally to bypass gates → guardrail monitor in CI will fail; policy enforcement required.  
5) Corrupt lock repeatedly written (disk issues) → detection via repeated “corrupt_lock” reason; mitigation: alert and stop wave0 until disk fixed.  
6) Wave0 killed mid-write leaving partial lock → treated as stale on next start; recovery by rerun once environment stable.

## SCAS
- Feedback: gate failures + guardrail + vitest output.  
- Redundancy: branch/commit/CI gates; guardrail + hook.  
- Visibility: explicit reasons for lock removal/blocks.  
- Adaptation: env overrides for protected branches, CI command, lock TTL, rate limit.  
- Graceful degradation: stale/corrupt locks cleaned; live locks preserved.
