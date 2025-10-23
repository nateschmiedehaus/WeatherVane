# Consensus Staffing Playbook

## Scope & Methodology
- **Data window:** 2025-10-10T02:19Z – 2025-10-20T07:15Z (`state/analytics/consensus_workload.json → sample_window`).
- **Sources:** Autopilot telemetry (`state/telemetry/usage.jsonl`), consensus simulation fixtures (`experiments/orchestration/simulation_report.md`), and live decision mix (`state/analytics/orchestration_metrics.json`).
- **Processing:** Aggregated 1,022 orchestration sessions to extract duration percentiles, retry frequencies, and token envelopes. Token cost per run derives from the execution telemetry averages (0.0059 USD/run).
- **Interpretation guardrails:** Simulation IDs (`CONS-SIM-*`) supply canonical participant sets; telemetry durations inform the cost envelope. When metrics lack a direct decision-type label, we map them conservatively (e.g., `success_rescue` sessions are treated as critical quorums because they required >1 loop and manual escalation).

## Workload Signals
- `success_rate` 31.5% (322 / 1,022). Most failures are short (<200 s) probe attempts; long-running sessions trend toward quorum success.
- Median successful quorum completes in **347 s**, with a p90 of **937 s**. Rescue paths (>900 s) align with critical escalations.
- Token envelope: ~454 tokens/run (402 prompt, 52 completion) ⇒ **$0.0059** baseline cost; rescue loops double this to ~$0.014.
- Retry pressure is modest (1%), but `invalid_summary` (2%) and `usage_limit` (7%) events correlate with missing pre-reads or stale critic evidence.

## Staffing Heuristics by Decision Type
| Decision | Default participants | Median cycle time | P90 cycle time | Token budget | When to use |
| --- | --- | --- | --- | --- | --- |
| **Specialist** | Atlas + Claude council | 347 s | 937 s | $0.0059 | Feature-specific fixes where critics are green and scope is narrow. |
| **Strategic** | Atlas + Claude council + Research Orchestrator | 509 s | 891 s | $0.0071 | Cross-squad prioritisation, model/design trade-offs, or when context ingestion is required. |
| **Critical** | Atlas + Claude council + Director Dana + Security critic | 1,204 s | 3,264 s | $0.0140 | Production-impacting changes, repeat blockers, or any quorum exceeding the 900 s p90 trigger. |

### Escalation Triggers
- **Duration > 900 s:** Promote the quorum to critical staffing (add Director Dana + security critic) to break stalemates and tighten risk review.
- **Retries > 1 in 24 h:** Pull Research Orchestrator in for preflight context consolidation; formalise evidence packets before re-running consensus.
- **Usage-limit saturation (7%):** Adjust token budgets or stagger specialist quorums; consider lowering concurrency to 2 to keep within policy envelopes.
- **Invalid summaries (2%):** Require lead delegate to attach blocker digests before convening a quorum; this cuts 330 s median wasted runtime.

## Implementation Guidance for T3.3.x
1. **Agenda builder inputs:** Feed `quorum_profiles` from `state/analytics/consensus_workload.json` into `agenda_builder.ts` so decision type selection references live duration + staffing data.
2. **Token budgeting:** Set `max_token_cost` per decision using the table above. For critical quorums, allow 3× baseline tokens and emit an alert if exceeded.
3. **Automatic escalation:** Embed the duration/retry triggers in `ConsensusEngine.run()`; promote quorum composition automatically once thresholds trip and record the escalation in the decision artifact.
4. **Critic readiness:** Require `manager_self_check` (or successor) to verify that evidence packs exist for decisions tagged `critical`, eliminating `invalid_summary` waste before quorums start.
5. **Telemetry feedback loop:** After each decision, append the observed duration/cost back into `consensus_workload.json` via the telemetry writer so heuristics stay current without manual recalculation.

## Known Limitations & Follow-up
- **Sparse decision mix:** Only three canonical decisions exist so far; expand simulation coverage to include blocked quorums and partial quorums to stress-test heuristics.
- **Token cost granularity:** Execution telemetry reports averages, not per-decision breakdowns. Instrument consensus runner to log per-participant token usage before rolling out automation.
- **Escalation taxonomy:** Current triggers focus on runtime and retries. Add critic-failure-based triggers once `security` and `integration_fury` emit structured severity levels.
- **Next actions:** (1) Wire telemetry ingestion in `T3.3.2` to append per-decision stats; (2) add regression tests that assert quorum promotion when duration thresholds are exceeded; (3) brief Director Dana on the staffing model before moving to full rollout.
