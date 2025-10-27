
# Runbook: Loop Spike

**Symptoms:** spike in `plan_loop_detected_total`, repeating plan hashes.

**Actions:**
1) Activate plan mutation (alt retrieval seed/tool/router).
2) Increase adversarial prompt deltas across agents.
3) Temporarily raise Review thresholds; require human gate for destructive tools.

**Verify:** loop ≤2% in 30m.
