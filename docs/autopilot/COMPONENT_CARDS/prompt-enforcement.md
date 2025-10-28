## Prompt Enforcement

- **Scope:** `tools/wvo_mcp/src/utils/prompt_headers.ts`, `docs/autopilot/SYSTEM_PROMPT_ENFORCEMENT.md`
- **Purpose:** Keep STRATEGIZE→MONITOR instructions immutable via signed headers and manifest attestation.
- **Key Signals:** Prompt signature + verification result stored in `state/process/ledger.jsonl`; session aborts on drift.
- **Integrations:** Atlas manifest hashes, WorkProcessEnforcer violation telemetry, decision journal evidence bundles.
