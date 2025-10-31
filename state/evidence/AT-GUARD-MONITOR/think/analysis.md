## Risk Analysis
- **Automation Drift**: automation JSON outputs may stale or be overwritten. Mitigation: check timestamps / run relevant commands if outdated.
- **Evidence Gaps**: guardrail tasks might lose STRATEGIZE→MONITOR artifacts after future changes. Mitigation: use `check_work_process_artifacts` as part of monitoring cadence.
- **CI Visibility**: Without recent CI run data, monitoring may rely on local integrity. Mitigation: document assumption and request CI screenshots/logs when available.
- **Noise vs Signal**: Monitoring must highlight actionable issues. Mitigation: capture discrepancies (if any) and create delta notes or follow-up tasks.
