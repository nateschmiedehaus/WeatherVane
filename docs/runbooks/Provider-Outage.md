
# Runbook: Provider Outage

**Symptoms:** 5xx bursts/timeouts/failed health.

**Actions:**
1) Trip circuit; route to fallback provider.
2) Serve cached responses on non‑critical paths.
3) Defer non‑urgent tasks; queue with long visibility.

**Verify:** close circuit after 3 healthy checks.
