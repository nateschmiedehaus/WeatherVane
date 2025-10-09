# Model Feedback & Calibration Plan

## Objectives
- Capture real-world performance to validate plan quality.
- Quantify calibration accuracy for quantile predictions.
- Detect drift in feature importance before allocations degrade.
- Provide operators with manual retraining playbooks (automation later).

## Workstreams
1. **Outcome ingestion**
   - Define canonical payload (date, channel, spend, revenue, campaign id).
   - Extend worker to upsert `storage/metadata/performance/{tenant}.json`.
   - Emit `metrics.emit("model.performance_ingest", {...})` for observability.

2. **Performance tracker**
   - Module: `apps/model/feedback/tracker.py`.
   - CLI/Prefect task: `python apps/worker/run.py <tenant> --check-performance`.
   - Outputs MAE/MAPE vs forecast, plan-level ROAS deltas, context tag updates (`model.performance.degraded`).

3. **Calibration monitoring**
   - Module: `apps/model/feedback/calibration.py`.
   - API: `calculate_coverage(predictions, actuals, quantiles) -> dict`.
   - Persist coverage history to `storage/metadata/performance/{tenant}_calibration.json`.
   - Alerts: warn < 0.70, warn > 0.90; emit `metrics.emit("model.calibration", {...})`.
   - Web UI: `/calibration` dashboard with `ConfidenceMeter` component (p10/p50/p90 coverage, trend chart).

4. **Drift detection**
   - Module: `apps/model/feedback/drift.py`.
   - Compare feature importances/SHAP values vs rolling baseline; compute PSI for key features.
   - Emit `model.drift_detected` tag when deviation > threshold; store drift summaries.

5. **Retraining playbook**
   - Flow: `apps/worker/flows/retrain_pipeline.py`.
   - Steps: data pull → training → evaluation (shadow vs current) → report.
   - Manual approval gate; produce artifacts under `storage/metadata/models/{tenant}/{timestamp}`.
   - Post results to metrics (`model.retrain.summary`) and CLI summary.

6. **Testing & automation**
   - Unit tests for each module.
   - Integration test hooking tracker + calibration on synthetic dataset.
   - CLI alert: `python apps/worker/run.py <tenant> --alert-forecast` warns when horizon coverage dips below threshold.
   - Future: schedule periodic tracker run (daily/weekly) once telemetry is stable.

## Dependencies
- Enhanced connector telemetry (Phase 1.5) to ensure source row counts align with performance data.
- Metrics helper already added in `shared.observability.metrics`.
- UI components require design tokens once design-system work starts.

## Open Questions
- Source of ground-truth performance (Shopify orders vs upstream ad platforms) and reconciliation strategy.
- Retention window for performance records (rolling 18 months?).
- Alert routing (Slack/email) once observability stack is wired.
