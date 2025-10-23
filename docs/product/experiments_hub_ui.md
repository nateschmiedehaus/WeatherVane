# Experiments Hub UI – Uplift & Incrementality Reviews

## Purpose
- Provide executives a one-screen decision on whether to approve incremental spend based on geo holdout lift.
- Equip marketing operations with instrumentation guardrails (sample sufficiency, randomisation, coverage, webhook health) before they act.
- Supply exports that translate statistical outputs into board-ready narratives (CSV package + slide outline).

## Design Decisions
- **Executive summary card** synthesises lift, confidence, recommendation, fallback, and surfaced risks. Badge tones map to decision posture (`success` for green, `caution` for guarded approvals, `critical` for halts).
- **Instrumentation banner** normalises four telemetry guardrails: total sample, treatment balance delta, forecast coverage vs 80% target, webhook delivery state derived from performance checks.
- **Exports surface** generates:
  1. CSV bundle (lift metrics + instrumentation detail) for finance and ops.
  2. Slides outline copied to clipboard with headline, risks, instrumentation, and fallback steps for exec briefings.
- **Creative guardrail posture** highlights channel-level flagged spend, dominant guardrails, and the representative creative to escalate before automation resumes, ordering the table by highest risk share.
- Reused existing plan surface theming so experiments inherits guardrail gradients and context spacing.

## Usage Workflow
1. Review the executive summary badge — only approve uplift when badge reads “Approve uplift” without caution tone.
2. Scan instrumentation chips for `caution`/`critical` signals; resolve sample balance or webhook delivery before acting.
3. Download CSV for audit trails and paste slide outline into deck for stakeholder review.
4. If lift is inconclusive, follow the fallback call-to-action (extend window, replay instrumentation, or revert underperforming geos).

## Known Limitations
- Webhook health piggybacks on performance summaries; dedicated webhook diagnostics API still pending (tracked under T3.4.4).
- CSV currently reflects single experiment snapshot; multi-experiment batches require backend aggregation.
- Slides outline copies as markdown-style bullets; native Google Slides template export remains backlog.

## Follow-ups
- Wire performance summary risk thresholds into Manager critic once security critic shell command regression is cleared.
- After telemetry API stabilises, add automated link-outs to raw BigQuery tables and JSON monitoring payloads.
