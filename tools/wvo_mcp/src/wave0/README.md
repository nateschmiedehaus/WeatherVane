# Wave 0 Autopilot Runner

**Status:** ✅ Proof-enabled, parser fixed
**Last Updated:** 2025-11-06

## Purpose

Autonomous task execution loop with proof validation.

## Recent Changes (2025-11-06)

### ✅ Proof System Integration
- Proof runs after every task execution
- Statuses: proven → done, discovering → blocked

### ✅ Roadmap Parser Fix (FUNDAMENTAL)
- Replaced brittle regex (52 LOC) with YAML.parse()
- Handles nested structures (epics → milestones → tasks)
- Via negativa: deleted fragile code, added robust solution

## Integration

**Uses:** `../prove/wave0_integration.ts`, `../supervisor/lease_manager.ts`

## Navigation

- Parent: `../README.md`
- Neighbor: `../prove/README.md`


<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-06T21:07:17.836Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp/src`
- Key children:
  - `tools/wvo_mcp/src/wave0/__tests__` (__tests__)

**What it is:**
- Path: `tools/wvo_mcp/src/wave0`
- Languages: ts (2)
- Children: 1
- Files: 3

**Key files:**
- `runner.ts` (12.1 KB)
- `task_executor.ts` (3.8 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src/prove`
- `tools/wvo_mcp/src/supervisor`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/wave0`

**Downstream consumers:**
- `tools/wvo_mcp/scripts`
- `tools/wvo_mcp/src/prove`
- `tools/wvo_mcp/src/wave0`
- `tools/wvo_mcp/src/wave0/__tests__`

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
- ⚠️ (locality) Imports reference 5 directories.
  - Recommendation: Review module boundaries; consider extracting shared utilities.

<!-- END DOCSYNC -->
