# tests

<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-05T23:27:13.405Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp/src`
- Key children:
  - `tools/wvo_mcp/src/tests/helpers` (helpers)

**What it is:**
- Path: `tools/wvo_mcp/src/tests`
- Languages: disabled (55), ts (13)
- Children: 1
- Files: 68

**Key files:**
- `manager_self_check_script.test.ts.disabled` (20.7 KB)
- `rollback_integration.test.ts` (16.5 KB)
- `model_discovery_integration.test.ts.disabled` (15.6 KB)
- `orchestrator_loop.test.ts.disabled` (14.9 KB)
- `unified_orchestrator.test.ts.disabled` (14.2 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src/critics`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/state`
- `tools/wvo_mcp/src/tests/helpers`
- `tools/wvo_mcp/src/tools`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/worker`

**Downstream consumers:**
- none detected

**Guardrails & tests:**
- Test files: 68
- Critic configs: 7
- TODO/FIXME markers: 0

**AFP/SCAS summary (5 = healthy):**
- Coherence: 5.0
- Economy/Via Negativa: 5.0
- Locality: 4.0
- Visibility: 5.0
- Evolution: 5.0

**Critical evaluation:**
- ⚠️ (locality) Imports reference 7 directories.
  - Recommendation: Review module boundaries; consider extracting shared utilities.

<!-- END DOCSYNC -->
