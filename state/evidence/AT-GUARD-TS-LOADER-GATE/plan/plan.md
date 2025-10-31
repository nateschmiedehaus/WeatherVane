## Plan
1. Draft CLI guard that inspects CI `run` blocks and detects TypeScript invocations without loader tokens.
2. Add vitest coverage covering inline, multi-line, and passing scenarios.
3. Wire guard into `.github/workflows/ci.yml` and `tools/wvo_mcp/scripts/run_integrity_tests.sh`.
4. Regenerate documentation/tooling index to reference the new guard.
5. Capture Verify evidence after running the updated checks.
