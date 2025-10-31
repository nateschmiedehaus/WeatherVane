# Quality Checks Benchmark

Timestamp: 2025-10-31T03:25:51.766Z
Iterations: 1
Reasoning task: FIX-E2E-QualityIntegration

## preflight

Command: bash scripts/preflight_check.sh --source autopilot
Exit codes: 1
Durations (ms): 165020.19
Stats — avg: 165000.00 ms, min: 165000.00 ms, max: 165000.00 ms, p95: 165000.00 ms

## quality_gates

Command: bash scripts/check_quality_gates.sh --source autopilot
Exit codes: 1
Durations (ms): 3183.62
Stats — avg: 3170.00 ms, min: 3170.00 ms, max: 3170.00 ms, p95: 3170.00 ms

## reasoning

Command: bash scripts/check_reasoning.sh --source autopilot --task FIX-E2E-QualityIntegration
Exit codes: 1
Durations (ms): 225.91
Stats — avg: 220.00 ms, min: 220.00 ms, max: 220.00 ms, p95: 220.00 ms
