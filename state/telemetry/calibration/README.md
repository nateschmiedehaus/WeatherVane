# Calibration Telemetry

Strike team and modeling sprint jobs should drop JSON metrics here (one file per run) alongside an appended `history.jsonl` timeline. Sample schema:

```json
{
  "timestamp": "2025-10-20T00:00:00Z",
  "tenant": "demo",
  "coverage_p10_p90": 0.82,
  "rmse": 104.2,
  "sample_size": 934,
  "notes": "post-LightweightMMM iteration"
}
```

Automation will tail this directory when publishing calibration reports.
