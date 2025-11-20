# THINK - AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120

## Edge Cases
1) Network blocked/timeouts → fallback to cached/stub data.  
2) Provider schema change → validation fails; skip with warning.  
3) Missing required fields (id/provider/observedAt/context) → reject candidate.  
4) Duplicate IDs with older timestamps → keep newer only.  
5) Benchmark data missing/invalid → ignore benchmarks; keep model entry.  
6) Cached file corrupt → fail safe, do not overwrite registry.  
7) Concurrent runs → last write wins; rely on backup + recency guard.  
8) Unexpected new lane/capability → treat as optional tags, don’t crash.

## Failure Modes
- Overwrite good entry with stale/wrong data → recency guard + allowlist.  
- Registry corrupted by bad write → backup before write; atomic write if feasible.  
- Live fetch hangs → timeout, fallback to cached.  
- Logger silence hides skips → ensure summary logs of adds/updates/skips.

## Assumptions
1) Providers allow JSON/cached lists or minimal fetch.  
2) Env flag controls live vs cached mode.  
3) Registry path writable; backup permitted.  
4) No new deps; use fetch or fs only.  
5) Tests run via Vitest; guardrail required.  
6) Wave0 dry-run available for smoke.  
7) Capability tags {coding, reasoning, vision} are sufficient for routing lanes.  
8) observedAt timestamps comparable (ISO).  
9) No concurrent writers in CI; single writer expected.  
10) Benchmarks optional.

## Complexity
- Essential: adapters + validation + merge; Accidental: schema drift handling.  
- Cyclomatic low; cognitive moderate due to validation.

## Mitigation Strategies
- Prevention: schema validation, allowlist providers, recency guard.  
- Detection: log summary of adds/updates/skips, test coverage.  
- Recovery: backup file, fallback to cached mode on fetch error, refuse overwrite on validation fail.

## Testing Strategy
- Unit: add new provider entry; update newer; skip invalid; cached-mode path.  
- Integration: guardrail; wave0 dry-run.  
- Manual: toggle live/cached env and verify deterministic output.

## Paranoid Scenarios
1) Provider returns poisoned model → allowlist + validation; refuse unknown provider.  
2) Empty candidate set overwrites registry → refuse write when existing non-empty and input empty (unless forced).  
3) Disk full during write → detect error, keep backup intact.  
4) Timestamp spoof earlier to block updates → allow manual override flag if needed; otherwise guard against downgrades.
