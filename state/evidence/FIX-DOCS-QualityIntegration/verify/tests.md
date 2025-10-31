# VERIFY — Command Log

| Check | Command | Status | Notes |
| --- | --- | --- | --- |
| Enforcement status CLI | `npm --prefix tools/wvo_mcp run enforcement:status -- --json` | pass | Output captured at `verify/logs/enforcement_status.json` |
| Troubleshooting links present | `rg 'QUALITY_INTEGRATION_TROUBLESHOOTING' CLAUDE.md tools/wvo_mcp/README.md docs/autopilot/WORK_PROCESS.md` | pass | Ensures each doc references the new guide |
| Work process enforcement section | `rg 'Quality Integration (Active Enforcement)' docs/autopilot/WORK_PROCESS.md` | pass | Confirms new mandatory section exists |
