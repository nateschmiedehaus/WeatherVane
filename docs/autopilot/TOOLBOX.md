# Autopilot Tool Index

Front-matter for every tool is generated in `docs/autopilot/MANIFEST.yml`; this page gives human-readable guidance.

## Core Orchestrator Tools
| Tool | Purpose | Preconditions | Postconditions / Evidence |
| --- | --- | --- | --- |
| `plan_next` | Fetch prioritized roadmap tasks and clusters. | MCP worker available; roadmap synced. | Returns `tasks[]` and `correlation_id`. |
| `plan_update` | Update task status in roadmap store. | Task ID exists; status ∈ {pending,in_progress,blocked,done}. | Roadmap entry updated; audit entry recorded. |
| `autopilot_status` | Report consensus load + staffing guidance. | None. | JSON snapshot referencing `state/analytics/`. |
| `critics_run` | Run critic bundles. | Critic definitions registered. | Structured findings saved to artifacts. |
| `context_snapshot` | Capture high-level context for audits. | Provide optional notes. | Snapshot appended to `state/context.md`.

## Atlas / Introspection Tools
| Tool | Purpose | Notes |
| --- | --- | --- |
| `self_describe` | Return mission, version, key components, policy hashes. | Uses `docs/autopilot/MANIFEST.yml`. |
| `self_list_tools` | Enumerate MCP tools with schema references and examples. | Includes new Atlas endpoints. |
| `self_get_schema` | Return JSON schema by id (e.g., `lcp`). | Validates existence in `docs/autopilot/DATA_SCHEMAS/`. |
| `self_get_prompt` | Fetch canonical prompt text by registry id. | Enforces prompt hash attestation. |
| `self_briefing_pack` | Return `AGENT_BRIEFING_PACK.json` metadata + hash. | Use before planning a session.

## Heavy Queue
- `heavy_queue_enqueue`, `heavy_queue_update`, `heavy_queue_list` coordinate long-running checks like `make smoke-context`.

## File + Execution Utilities
- `fs_read` / `fs_write` — workspace IO (respect DRY_RUN guard).
- `cmd_run` — sandboxed shell execution with logging.
- `artifact_record` — attach artifacts to a run ledger entry.

Each entry includes more structured metadata in the manifest to keep MCP introspection cheap for agents.
