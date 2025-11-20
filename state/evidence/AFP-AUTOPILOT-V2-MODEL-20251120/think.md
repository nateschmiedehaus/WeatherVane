# THINK - AFP-AUTOPILOT-V2-MODEL-20251120

## Edge Cases (10)
1) Empty/absent registry file -> seeds used, stamp now, log.
2) Huge registry file (10MB+) -> parse slow/fail; cap size, fallback to seeds, log.
3) Corrupt JSON -> parse error; fallback to seeds, log error.
4) Stale last_updated (>TTL) with wrong content -> forceRefresh seeds, log stale.
5) Missing capability_tags -> model excluded; log, recommend Scout.
6) Conflicting IDs across providers -> merge overwrites; log conflict, favor latest, keep last-good in memory.
7) No gemini/o3 providers -> deep/fast lanes undefined; log and reroute to remaining providers.
8) Available=false on all fast models -> fast lane undefined; log; caller uses standard.
9) Disk permissions prevent save -> warn, keep in-memory; prompt manual fix.
10) Clock skew (future last_updated) -> treat as stale by max TTL; log anomaly.

## Failure Modes (10)
1) Wrong lane chosen (slow/expensive). Impact Med, Likelihood Med. Detection: logs + metrics on lane IDs. Prevention: weights + tags + test. Recovery: adjust weights, rerun Scout.
2) Registry corruption persists. Impact Med, Likelihood Low. Detection: load errors; guardrail logs. Recovery: reload seeds, overwrite file.
3) Scout ingests bad data. Impact Med, Likelihood Med. Detection: conflict log; sudden cost/context drop. Recovery: revert to last-good (merge keeps prior), manual review.
4) Staleness never refreshed. Impact Med, Likelihood Med. Detection: last_updated > TTL; guardrail warning. Recovery: forceRefresh, schedule Scout.
5) Missing lanes unnoticed. Impact Med, Likelihood Low. Detection: log when undefined; metric on missing lanes. Recovery: reroute, run Scout.
6) Legacy callers break on new types. Impact High, Likelihood Low. Detection: TS/CI; unit tests. Recovery: back out type change, keep additive API.
7) Tests rely on disk registry state. Impact Low, Likelihood Med. Detection: flaky test names. Recovery: make tests non-brittle; force seeds in test env.
8) Cost/context inaccurate. Impact Med, Likelihood Med. Detection: compare Scout data to seeds; sanity checks (cost>0). Recovery: adjust tags/costs; manual override.
9) Audit/guardrail skipped. Impact High, Likelihood Low. Detection: guardrail monitor; audit freshness. Recovery: run audit; rerun guardrail before commit.
10) Wave0 lock hides runtime issues. Impact Med, Likelihood Med. Detection: wave0 dry-run log. Recovery: coordinated restart, no manual lock delete.

## Assumptions (12) with risk/mitigation
1) Files UTF-8. If wrong: parse fail. Likelihood Low, Impact Med. Mitigation: catch parse error -> seeds.
2) Path state/models_registry.json accessible. If not: save fail. Likelihood Med, Impact Med. Mitigation: mkdir + log on error.
3) Vitest available. If not: test blocked. Likelihood Low. Mitigation: document; rerun when available.
4) Scout will run weekly. If not: seeds stale. Likelihood Med. Mitigation: monitor last_updated; alert if >TTL.
5) Capability tags present on seeds. If not: lanes empty. Likelihood Low. Mitigation: ensure seeds include tags; log missing.
6) Costs non-zero. If zero: costScore skew. Likelihood Low. Mitigation: min cost guard; log anomalies.
7) Context window numeric. If NaN: scoring off. Likelihood Low. Mitigation: default 0; log.
8) Available flag accurate. If false positives: wrong lanes. Likelihood Med. Mitigation: allow manual overrides via merge.
9) Providers limited to claude/codex/gemini/o3. If new provider added: ignored. Likelihood Med. Mitigation: extend ModelProvider when needed.
10) Router handles undefined lane. If not: crash. Likelihood Low. Mitigation: log + return undefined; caller must guard.
11) System clocks roughly accurate. If skewed: TTL miscalc. Likelihood Low. Mitigation: treat future timestamps as stale.
12) Repo write permissions OK. If not: cannot persist. Likelihood Low. Mitigation: log; manual fix.

## Complexity Analysis
- Essential complexity: capability tagging + lane scoring + provider merge. Cyclomatic small (lane scorer branches). Cognitive moderate (weights). Integration: touches registry/manager/discovery; no new deps.
- Accidental complexity risks: weight tuning, seed maintenance. Mitigated by tests, logs, and Scout plan.
- No large functions introduced; scoring kept small.

## Mitigation Strategies
- Prevention: use seeds with tags; additive schema; weights documented; validate providers before use; mkdir on save.
- Detection: logging on stale registry, missing lanes, conflicts, read/write errors; metrics (last_updated, lane availability); guardrail/audit.
- Recovery: fallback to seeds on failure; merge preserves last-good; forceRefresh; reroute when lane undefined; manual seed override if Scout bad.

## Testing Strategy (10 cases)
1) Lane selection returns some fast model (non-brittle) using seeds.
2) Standard lane returns defined ID.
3) Deep lane returns defined ID.
4) Registry with missing capability_tags -> lane undefined logged.
5) Stale registry triggers forceRefresh in test by simulating old timestamp.
6) MergeExternalProvider overwrites by ID and preserves prior others.
7) Available=false models excluded from lanes.
8) Corrupt registry falls back to seeds (simulate bad JSON read).
9) Guardrail monitor passes with fresh audit (executed).
10) Wave0 dry-run executed/logged (expect lock noted if present).

## Paranoid / Worst-Case
- Malicious Scout data wipes models: merge by ID keeps prior; log anomaly; reload seeds; manual review.
- Hook bypass lets stale registry ship: guardrail + commit:check catch; remediation task.
- Cost exploit (set to 0) to force selection: set floor costScore; log zero costs.
- Seeds never updated: monitor last_updated; alert after TTL; forceRefresh + manual ProviderModels.

## Metrics / Signals
- last_updated vs TTL; lane availability counts; conflict logs; guardrail status; audit freshness; commit:check counts; wave0 lock presence; Scout runs/week; external merges/provider.

## Upstream/Downstream
- Upstream: external model releases/benchmarks; need weekly Scout to ingest and update tags/costs/benchmarks.
- Downstream: Router/agents must handle undefined lanes; ops rely on logs for stale/missing lanes.

## Action Plan
1) Keep seeds/tags for claude/codex/gemini/o3; lane scorer + mergeExternalProvider in registry; lane getters in manager.
2) Preserve legacy APIs.
3) Maintain non-brittle lane test; add scenarios as above.
4) Weekly Scout plan + stale logging; use guardrail/audit signals.
5) Fresh audit done; guardrail pass; run wave0 dry-run and commit:check before finalize.
6) If needed, spin remediation for benchmark-driven scoring automation while keeping current safeguards.
