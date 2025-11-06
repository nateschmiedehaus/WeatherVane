# Proof System

**Status:** ✅ Complete (3 layers implemented)
**Last Updated:** 2025-11-06
**Owner:** WeatherVane Autopilot

## Purpose

Solves the 78% verification gap through proof-driven development:
- Makes iteration **unavoidable** (structural enforcement)
- Makes iteration **desirable** (psychological gamification)
- Learns from production failures (institutional memory)

## Architecture (3 Layers)

### Layer 1: Structural Enforcement ✅
Auto-verification that can't be skipped.

### Layer 2: Multi-critic Validation ⏳
DesignReviewer validates proof criteria quality (future).

### Layer 3: Production Feedback ✅
Tracks "false proven" tasks that fail in production.

## Modules

| Module | Purpose | Status | LOC |
|--------|---------|--------|-----|
| `types.ts` | Core type definitions | ✅ | 167 |
| `phase_manager.ts` | Task phase decomposition | ✅ | 205 |
| `proof_system.ts` | Auto-verification engine | ✅ | 415 |
| `discovery_reframer.ts` | Positive language transformation | ✅ | 185 |
| `progress_tracker.ts` | Progress visualization | ✅ | 152 |
| `achievement_system.ts` | Gamification layer | ✅ | 237 |
| `wave0_integration.ts` | Wave 0 integration | ✅ | 188 |
| **`production_feedback.ts`** | **⭐ Layer 3 prod tracking** | **✅ NEW** | **150** |
| **`self_improvement.ts`** | **⭐ Auto-improvement** | **✅ NEW** | **280** |

**Total:** 1,979 LOC

## Recent Changes (2025-11-06)

### Added Layer 3: Production Feedback
- `production_feedback.ts` - Tracks proven tasks that fail in production
- Creates `FALSE_PROVEN.md` markers for institutional memory
- Logs to `production_failures.jsonl` for trend analysis

### Added Self-Improvement System
- `self_improvement.ts` - Automatically creates improvement tasks
- Scans completed work every 30 days
- Max 3 improvements per cycle (prevents infinite loops)
- Only runs when <5 pending tasks
- Types: via_negativa, refactor, test_coverage, production_feedback

## Integration Points

**Used by:**
- `../wave0/runner.ts` - Proof runs after task execution
- Future: Multi-agent orchestrator

**Dependencies:**
- `../supervisor/lease_manager.ts` - Task leasing
- `../supervisor/lifecycle_telemetry.ts` - Event tracking
- `../telemetry/logger.ts` - Structured logging

## How It Works

1. **Task executes** → Wave 0 runner completes implementation
2. **Proof attempts** → `proof_system.ts` runs verification checks
3. **Proven?** → Status = "done", verify.md generated, achievements unlocked
4. **Unproven?** → Status = "discovering", improvement phases created
5. **Production failure?** → `production_feedback.ts` marks FALSE_PROVEN
6. **30 days later** → `self_improvement.ts` scans for improvements

## Evidence & Testing

- Build: ✅ 0 errors (all modules compile)
- Evidence: `state/evidence/AFP-PROOF-DRIVEN-GAMIFICATION-20251106/`
- Evidence: `state/evidence/AFP-PROOF-SYSTEM-COMPLETE-DEPLOYMENT-20251106/`
- Live testing: ⏳ Pending roadmap remediation

## Navigation

- **Parent:** `../README.md` (MCP server source overview)
- **Neighbor:** `../wave0/README.md` (runner integration)
- **Neighbor:** `../supervisor/README.md` (dependencies)
- **Root:** `../../README.md` (MCP server root)

## See Also

- Design: `state/evidence/AFP-PROOF-DRIVEN-GAMIFICATION-20251106/design.md`
- Plan: `state/evidence/AFP-PROOF-SYSTEM-COMPLETE-DEPLOYMENT-20251106/plan.md`
- Verification: `state/evidence/AFP-PROOF-SYSTEM-COMPLETE-DEPLOYMENT-20251106/verify.md`


<!-- BEGIN DOCSYNC -->

## Local Knowledge (generated 2025-11-06T21:07:17.830Z)

**Hierarchy:**
- Parent: `tools/wvo_mcp/src`
- Key children:
  - `tools/wvo_mcp/src/prove/__tests__` (__tests__)

**What it is:**
- Path: `tools/wvo_mcp/src/prove`
- Languages: ts (9)
- Children: 1
- Files: 10

**Key files:**
- `proof_system.ts` (12.3 KB)
- `self_improvement.ts` (9.1 KB)
- `achievement_system.ts` (7.4 KB)
- `phase_manager.ts` (6.9 KB)
- `discovery_reframer.ts` (6.6 KB)

**Upstream dependencies:**
- `tools/wvo_mcp/src/prove`
- `tools/wvo_mcp/src/telemetry`
- `tools/wvo_mcp/src/utils`
- `tools/wvo_mcp/src/wave0`

**Downstream consumers:**
- `tools/wvo_mcp/src/prove`
- `tools/wvo_mcp/src/prove/__tests__`
- `tools/wvo_mcp/src/wave0`
- `tools/wvo_mcp/src/wave0/__tests__`

**Guardrails & tests:**
- Test files: 0
- Critic configs: 0
- TODO/FIXME markers: 0

**AFP/SCAS summary (5 = healthy):**
- Coherence: 5.0
- Economy/Via Negativa: 5.0
- Locality: 5.0
- Visibility: 3.0
- Evolution: 5.0

**Critical evaluation:**
- ❌ (visibility) No tests detected for executable code.
  - Recommendation: Add unit/integration tests before merging changes.

<!-- END DOCSYNC -->
