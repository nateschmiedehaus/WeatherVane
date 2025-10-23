# Modeling Meta-Review Playbook

Quarterly runtime discipline keeps the modeling roadmap honest: this playbook codifies how Atlas, Director Dana, and the modeling pod inspect execution against strategy, surface variance, and decide mid-course corrections.

## Purpose & Scope
- Ensure roadmap intent (model coverage, guardrails, allocator lift) matches shipped artifacts.
- Detect drift between modeling reality critic output and product narratives before they become escalations.
- Reinforce accountability loops so roadmap tasks close with evidence (critics, tests, artifacts, telemetry) rather than intent alone.

Applies to all modeling squads (forecasting, allocator, causal, experimentation) and their cross-functional partners in Product & Design.

## Cadence & Governance
- **Frequency:** Quarterly, anchored in the first full week of each new quarter.
- **Kickoff driver:** Atlas schedules and documents the cadence (see `state/analytics/modeling_meta.json`).
- **Participants:** Modeling lead (chair), Atlas (facilitator), Director Dana (decision authority), Data Quality steward, Design Systems partner, Product Ops note-taker.
- **Inputs owners:** Each squad lead is responsible for keeping their telemetry bundles current; Atlas verifies during pre-read.

## Quarterly Checklist
| Phase | Window | Owner | Deliverables | Evidence |
| --- | --- | --- | --- | --- |
| Pre-read compilation | ≥7 days before review | Modeling lead | Updated modeling roadmap deltas, critic regressions, KPI dashboards | `docs/MODELING_REALITY_CHECK.md`, `state/analytics/modeling_meta.json` |
| Telemetry sweep | ≥5 days before review | Atlas | Refresh `tools/wvo_mcp/scripts/run_modeling_reality_critic.py --json` output, archive variance metrics | `state/analytics/modeling_meta.json.variance_reports[*]` |
| Design & product sync | ≥3 days before review | Design Systems partner | Cross-check UI/UX narratives vs modeling state | `docs/PRODUCT_STATUS.md`, design QA notes |
| Review session | Scheduled kickoff | Director Dana (chair) | Decision log, prioritized remediation stack | Meeting notes, `state/context.md` entry |
| Post-review actions | ≤3 days after review | Squad leads | Jira/GitHub issues opened, roadmap updates pushed | `state/roadmap.yaml`, task memos |
| Quarter close validation | Last day of quarter | Atlas + Modeling lead | Confirm action items closed, prep next kickoff packet | updated `state/analytics/modeling_meta.json` snapshot |

## Telemetry & Variance Sources
- **Primary variance bundle (`state/analytics/modeling_meta.json`):** Houses structured snapshots of critic scores, KPI deltas (allocator lift, MMM accuracy, guardrail breaches), and narrative summaries for each quarter. Append new reports, do not overwrite history.
- **Critics:** Run `node tools/wvo_mcp/scripts/run_modeling_reality_critic.py --profile high --json` and `node tools/wvo_mcp/scripts/run_allocator_checks.mjs high`. Persist JSON blobs or summarized metrics into the variance bundle with a `source` pointer to the command and git revision.
- **Integrity suite evidence:** Reference `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` output to show full stack health; log failures explicitly.
- **Context ledger:** Each review produces a concise `state/context.md` entry linking to artifacts, ensuring the next cycle inherits findings.

## Review Agenda (60 minutes)
1. **Opening (5 min):** Recap previous quarter’s commitments and outstanding actions.
2. **Telemetry walk-through (20 min):** Atlas presents variance highlights with supporting plots/metrics from the JSON bundle.
3. **Experience alignment (10 min):** Design Systems partner contrasts live UX with promised modeling capabilities.
4. **Decision block (15 min):** Director Dana confirms go-forward actions, reorders roadmap items, or requests additional analysis.
5. **Action logging (10 min):** Modeling lead enumerates owners, due dates, critic reruns, and roadmap updates; Ops note-taker drafts summary.

## Post-Review Execution
- Create or update roadmap items via `plan_update` immediately after decisions.
- Open implementation issues/tests the same day; attach telemetry snapshots as evidence.
- Schedule interim critic reruns (monthly by default) for any high-variance metrics until resolved.
- Update `state/analytics/modeling_meta.json` with `last_reviewed_at`, `next_review_at`, and appended variance entries.
- Record a fresh `state/context.md` summary once remediation lands (tests, critics, docs referenced).

## Edge Cases & Escalation Paths
- **No fresh telemetry:** Run the critics and MMM backtests before meeting; if blocked, escalate to Director Dana and document the blocker in `state/context.md`.
- **Cross-domain regressions:** If variance originates outside modeling (e.g., data ingestion), loop in the owning squad and log a dependency blocker via `plan_update`.
- **Token budget pressure:** Defer low-impact reruns, prioritize critics flagged in policy directive, and document mitigations.
- **Scheduling conflicts:** Atlas re-books within five business days and updates `state/analytics/modeling_meta.json.kickoff_event.status` to `rescheduled`.

## Maintenance & Ownership
- Atlas owns this playbook; any structural changes require Director Dana’s approval.
- Keep the document aligned with tooling updates (critics, telemetry scripts). When new diagnostics ship, add them to the pre-read checklist.
- Archive superseded guidance in `docs/archive/` rather than deleting content—future cycles rely on historical context.

## Quick Reference Commands
```bash
# Refresh variance telemetry and append to state/analytics/modeling_meta.json
node tools/wvo_mcp/scripts/run_modeling_reality_critic.py --profile high --json > /tmp/modeling_reality.json
python tools/wvo_mcp/scripts/nightly_mmm_backtest.py --output /tmp/mmm_backtest.json
python -m tools.wvo_mcp.scripts.collect_performance_benchmarks /tmp/modeling_reality.json /tmp/mmm_backtest.json
```

Ensure the aggregated output is merged into the JSON bundle with metadata fields (`cycle`, `generated_at`, `source_commands`, `highlights`, `risk_score`) so future quarters trend variance instead of rediscovering it.
