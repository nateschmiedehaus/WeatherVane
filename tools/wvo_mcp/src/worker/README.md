# worker

<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-05T23:27:13.406Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp/src`
- Key children: none

**What it is:**
- Path: `tools/wvo_mcp/src/worker`
- Languages: ts (6)
- Children: 0
- Files: 6

**Key files:**
- `tool_router.ts` (39.8 KB)
- `worker_manager.ts` (33.1 KB)
- `worker_entry.ts` (13.9 KB)
- `worker_client.ts` (5.6 KB)
- `executor_router.ts` (2.8 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/executor`
- `tools/wvo_mcp/src/observability`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/state`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/worker`

**Downstream consumers:**
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/tests`
- `tools/wvo_mcp/src/worker`

**Guardrails & tests:**
- Test files: 0
- Critic configs: 0
- TODO/FIXME markers: 0

**AFP/SCAS summary (5 = healthy):**
- Coherence: 5.0
- Economy/Via Negativa: 5.0
- Locality: 4.0
- Visibility: 3.0
- Evolution: 5.0

**Critical evaluation:**
- ❌ (visibility) No tests detected for executable code.
  - Recommendation: Add unit/integration tests before merging changes.
- ⚠️ (locality) Imports reference 8 directories.
  - Recommendation: Review module boundaries; consider extracting shared utilities.

<!-- END DOCSYNC -->
