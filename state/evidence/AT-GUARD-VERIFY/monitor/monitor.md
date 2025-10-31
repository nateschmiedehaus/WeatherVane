# Monitor

- Track next integrity run after remediation; ensure app smoke + roadmap evidence checks pass.
- Monitor enforcement telemetry counters (`enforcement_blocks_total`, `enforcement_bypass_total`) once failures resolved; verify they align with strict-mode rollout plan.
- Watch `tests/test_mcp_tools.py` parity status in CI until MCP CLI timeout eliminated.
