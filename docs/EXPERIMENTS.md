# Incrementality & Backtesting

## Overview
- Design geo holdouts to prove weather lift.
- Persist experiment designs + outcomes under `storage/metadata/incrementality`.
- API route `/v1/experiments/{tenant}` returns design + summary for UI dashboards.
- Worker flow `apps/worker/flows/experiment_pipeline.py` seeds designs; future iterations compute summaries once outcome data is ingested.

## Data Flow
1. `orchestrate_poc_flow` computes `_design_incrementality_from_orders` and stores assignment data in plan metadata + context.
2. `design_experiment_from_orders` writes the design to the incrementality state store.
3. Outcome ingestion (`python apps/worker/run.py <tenant> --experiment-observations results.json`) populates summary metrics (lift, p-value, confidence interval).
4. `/experiments/{tenant}` exposes the latest report; the web UI renders status, control share, and lift metrics.

### Recording experiment outcomes

Provide a JSON (or Parquet) file with one row per geo holdout containing `geo`, `group`, and `revenue` columns:

```json
[
  {"geo": "geo_a", "group": "treatment", "revenue": 15230.0},
  {"geo": "geo_b", "group": "control", "revenue": 12100.0}
]
```

Run (optionally add `--experiment-format parquet` when using Parquet files):

```bash
python apps/worker/run.py acme-tenant --experiment-observations results.json
```

The worker merges the outcomes with the stored design, recomputes lift statistics, and makes them available to the API/UI through `PlanResponse.incrementality_summary`.

## Next Steps
- Hook outcome ingestion to populate `summary` field. ✅ (`python apps/worker/run.py <tenant> --experiment-observations results.json`)
- Build backtesting charting (lift over time, cumulative ROAS). ✅ Experiments page now renders a lift timeline.
- Add notifications when experiments reach significance.
