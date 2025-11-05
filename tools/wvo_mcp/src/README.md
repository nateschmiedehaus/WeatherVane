# src

<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-05T23:27:13.406Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp`
- Key children:
  - `tools/wvo_mcp/src/analytics` (analytics)
  - `tools/wvo_mcp/src/auth` (auth)
  - `tools/wvo_mcp/src/critics` (critics)
  - `tools/wvo_mcp/src/enforcement` (enforcement)
  - `tools/wvo_mcp/src/executor` (executor)

**What it is:**
- Path: `tools/wvo_mcp/src`
- Languages: ts (3), disabled (1)
- Children: 27
- Files: 4

**Key files:**
- `index-claude.ts` (65.2 KB)
- `session.ts` (42.7 KB)
- `index-orchestrator.ts.disabled` (25.9 KB)
- `index.ts` (15.6 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/critics`
- `tools/wvo_mcp/src/executor`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/planner`
- `tools/wvo_mcp/src/quality`
- `tools/wvo_mcp/src/state`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/worker`

**Downstream consumers:**
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/orchestrator`
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
- ⚠️ (locality) Imports reference 10 directories.
  - Recommendation: Review module boundaries; consider extracting shared utilities.

<!-- END DOCSYNC -->
