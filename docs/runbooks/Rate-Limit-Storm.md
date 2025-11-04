
# Runbook: Rate‑Limit Storm

**Symptoms:** 429 surge, circuit‑open rising, success dropping.

**Actions:**
1) Increase backoff + jitter; cut concurrency ~50%.
2) Route to fallback model/provider or cached path.
3) Raise thresholds for token‑heavy tools; optionally switch to lower‑cost model.

**Verify:** success ≥95% within 15m; p95 latencies stabilize.
