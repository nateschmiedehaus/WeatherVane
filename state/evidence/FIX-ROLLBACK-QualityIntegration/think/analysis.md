# Analysis — FIX-ROLLBACK-QualityIntegration

## Key Questions
1. **Where should the override live?** — Placing it in `state/config/quality_integration.json` keeps alignment with other autopilot configs and makes it git-ignored yet auditable.
2. **Default behaviour when file missing?** — To keep guardrails on, default to "enabled in shadow mode"; the toggle script can write explicit disable/enable states.
3. **How do we surface the 85% trigger?** — Parse existing JSONL telemetry (preflight/quality_gates/reasoning) and compute success rates. When data is missing, emit `status: "insufficient_data"` so operators know to investigate before rolling back.
4. **How to prevent conflicting edits?** — Toggle CLI should be the single writer. We’ll read existing config, mutate, and write with pretty JSON; tests ensure idempotency.
5. **How do we validate the toggle?** — Unit test loads config, runs toggle function, and asserts `enabled` flags change; runtime-level integration test ensures WorkProcessEnforcer receives the updated object (mock metrics + state machine).

## Risks & Mitigations
- **Partial disable**: If CLI crash occurs mid-write, config might corrupt. Mitigation: write to temp file and rename (atomic within script).
- **Telemetry gaps**: Dashboard may lack data if quality scripts haven’t run. Mitigation: mark status as `insufficient_data` with guidance to rerun checks post-change.
- **Compatibility**: Older orchestrator runtimes might ignore new config. Mitigation: runtime defaults to enable if config missing/invalid, so failure mode is "guardrails stay on".
- **Operator confusion**: Provide `--status` command that prints current state along with path of config/dates.

## Oracles
- Unit tests for config utilities + CLI toggling + dashboard aggregator.
- Manual CLI smoke during VERIFY (record before/after JSON).
- Dashboard output verifying threshold logic.
