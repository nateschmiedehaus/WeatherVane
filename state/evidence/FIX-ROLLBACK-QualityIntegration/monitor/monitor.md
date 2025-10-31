# Monitor Notes

- Keep `state/analytics/quality_checks_dashboard.json` under watch; once guardrails run, confirm success rate exceeds the 85 % threshold.
- After deploying, verify `quality_integration_toggle.ts --status` reflects the expected override state when operators exercise rollback.
- Roadmap evidence validator still fails for legacy tasks; track remediation separately to avoid obscuring regressions.
