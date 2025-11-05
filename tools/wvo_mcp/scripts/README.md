# scripts

<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-05T23:27:13.399Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp`
- Key children:
  - `tools/wvo_mcp/scripts/__pycache__` (__pycache__)

**What it is:**
- Path: `tools/wvo_mcp/scripts`
- Languages: sh (29), py (22), mjs (19), ts (15), mts (1), sql (1)
- Children: 1
- Files: 87

**Key files:**
- `autopilot.sh` (167.7 KB)
- `autopilot_policy.py` (45.9 KB)
- `activity_feed.py` (43.8 KB)
- `format_telemetry.mjs` (31.6 KB)
- `check_manager_state.mjs` (30.5 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/dist/orchestrator`
- `tools/wvo_mcp/scripts`
- `tools/wvo_mcp/src/analytics`
- `tools/wvo_mcp/src/critics`
- `tools/wvo_mcp/src/orchestrator`

**Downstream consumers:**
- `tools/wvo_mcp/scripts`

**Guardrails & tests:**
- Test files: 0
- Critic configs: 5
- TODO/FIXME markers: 0

**AFP/SCAS summary (5 = healthy):**
- Coherence: 4.0
- Economy/Via Negativa: 5.0
- Locality: 4.0
- Visibility: 3.0
- Evolution: 5.0

**Critical evaluation:**
- ⚠️ (coherence) Directory contains 6 languages (.py, .ts, .sh, .mts, .mjs, .sql).
  - Recommendation: Consider splitting language-specific modules.
- ❌ (visibility) No tests detected for executable code.
  - Recommendation: Add unit/integration tests before merging changes.
- ⚠️ (locality) Imports reference 5 directories.
  - Recommendation: Review module boundaries; consider extracting shared utilities.

<!-- END DOCSYNC -->
