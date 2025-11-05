# orchestrator

<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-05T23:27:13.404Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp/src`
- Key children:
  - `tools/wvo_mcp/src/orchestrator/consensus` (consensus)

**What it is:**
- Path: `tools/wvo_mcp/src/orchestrator`
- Languages: ts (87), disabled (4), js (1)
- Children: 1
- Files: 93

**Key files:**
- `unified_orchestrator.ts` (131.7 KB)
- `operations_manager.ts` (70.6 KB)
- `state_machine.ts` (44.6 KB)
- `agent_coordinator.ts` (43.6 KB)
- `context_assembler.ts` (41.3 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/analytics`
- `tools/wvo_mcp/src/critics`
- `tools/wvo_mcp/src/intelligence`
- `tools/wvo_mcp/src/limits`
- `tools/wvo_mcp/src/models`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/orchestrator/consensus`
- `tools/wvo_mcp/src/planner`
- `tools/wvo_mcp/src/state`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/web_tools`

**Downstream consumers:**
- `tools/wvo_mcp/scripts`
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/analytics`
- `tools/wvo_mcp/src/analytics/__tests__`
- `tools/wvo_mcp/src/critics`
- `tools/wvo_mcp/src/executor`
- `tools/wvo_mcp/src/intelligence`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/orchestrator/consensus`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/tests`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/worker`

**Guardrails & tests:**
- Test files: 17
- Critic configs: 3
- TODO/FIXME markers: 2

**AFP/SCAS summary (5 = healthy):**
- Coherence: 4.0
- Economy/Via Negativa: 5.0
- Locality: 4.0
- Visibility: 5.0
- Evolution: 5.0

**Critical evaluation:**
- ⚠️ (coherence) Directory contains 3 languages (.ts, .disabled, .js).
  - Recommendation: Consider splitting language-specific modules.
- ⚠️ (locality) Imports reference 13 directories.
  - Recommendation: Review module boundaries; consider extracting shared utilities.

<!-- END DOCSYNC -->
