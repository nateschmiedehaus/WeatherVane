## Monitor Notes — FIX-E2E-QualityIntegration

- Keep nightly CI on `quality_integration_e2e` to detect regressions when quality scripts or WorkProcessEnforcer change.
- If quality checks evolve (new script paths or modes), extend the fixture generator so this suite remains authoritative.
- Watch for telemetry schema changes; update assertions if analytics JSONL format shifts.
