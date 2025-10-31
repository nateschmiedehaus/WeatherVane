# THINK — Analysis

## What Changed Since the Last Draft?
- Phase 0 instrumentation now exists (collector, checker, baseline evidence, dashboard integration). Docs currently lack any mention.
- tmux status line + enforcement metrics dashboard expose baseline freshness; users need to know how to interpret and react.
- Autonomy policies (zero deferrals, override expiry, follow-up enforcement) hardened in recent missions—must be reflected in guidance.

## Key Documentation Gaps
- **Mission framing:** Many sections still describe quality integration as optional. Need explicit tie to 100% autonomy + baseline SLOs.
- **Instrumentation usage:** No quick reference for `collect_phase0_baseline.mjs`, `check_phase0_baseline.ts`, evidence paths, or retention.
- **Escalation triggers:** Override clearance, stale baseline (>24h), parity drift thresholds are scattered or missing.
- **Parity/capability cadence:** Mentioned but not anchored to twice-weekly sweeps and roadmap evidence expectations.
- **Troubleshooting depth:** Lacks baseline gap remediation playbook and guidance for instrumentation-derived alerts.

## Update Themes
1. **Unified navigation:** Cross-link four docs + Phase 0 contract so agents can jump between narrative, CLI reference, troubleshooting, and evidence requirements.
2. **Command tables:** Provide explicit commands + expected outputs for baseline, parity, capability, override clearance.
3. **Loopback checklist:** Reinforce zero-deferral policy, including when to rerun instrumentation scripts before VERIFY.
4. **Escalation guidance:** Document when to open incidents/escalate to Reliability pod (e.g., baseline missing >24h, consecutive parity failures, override >24h).

## Additional Considerations
- Ensure language is Codex/Claude neutral (avoid “Claude-only” instructions).
- Keep docs DRY: detailed instrumentation schema lives in Phase 0 contract—link instead of duplicating.
- Highlight storage paths for evidence to aid automation (state/telemetry/baseline, state/analytics/baseline_runs.jsonl, etc.).
