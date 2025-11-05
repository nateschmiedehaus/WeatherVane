# utils

<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-05T23:27:13.406Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp/src`
- Key children: none

**What it is:**
- Path: `tools/wvo_mcp/src/utils`
- Languages: ts (33)
- Children: 0
- Files: 33

**Key files:**
- `output_validator.test.ts` (23.6 KB)
- `output_validator.ts` (14.6 KB)
- `device_profile.test.ts` (13.2 KB)
- `provider_manager.ts` (12.5 KB)
- `critic_model_selector.ts` (12.3 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src/limits`
- `tools/wvo_mcp/src/models`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/providers`
- `tools/wvo_mcp/src/state`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/utils`

**Downstream consumers:**
- `tools/wvo_mcp/src`
- `tools/wvo_mcp/src/analytics`
- `tools/wvo_mcp/src/critics`
- `tools/wvo_mcp/src/executor`
- `tools/wvo_mcp/src/orchestrator`
- `tools/wvo_mcp/src/orchestrator/consensus`
- `tools/wvo_mcp/src/planner`
- `tools/wvo_mcp/src/state`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/tests`
- `tools/wvo_mcp/src/tools`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/web_tools`
- `tools/wvo_mcp/src/worker`

**Guardrails & tests:**
- Test files: 6
- Critic configs: 1
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
