# Design: AFP-OVERRIDE-ROTATION-20251106

> **Purpose:** Define the architecture for override-log rotation and **daily** artifact audits, ensuring enforcement integrates with existing ProcessCritic workflows.

---

## Context

Override logs accumulate indefinitely and artifact audits lack an operational cadence. We need scripted rotation, archival strategy, and critic enforcement so Git discipline remains durable.

---

## Five Forces Check

### COHERENCE
- [x] Patterns reviewed:
  - `tools/wvo_mcp/scripts/run_integrity_tests.sh` (batch script structure)
  - `tools/wvo_mcp/scripts/run_process_critic.mjs` (existing critic CLI)
  - `state/analytics/archives/` (layout for historical data)
- Selected pattern: “Script + critic enforcement” used by integrity tests.

### ECONOMY
- Via negativa considered: Could we rely on manual rotation? Rejected—manual process already failed.
- LOC estimate: Script (~120 LOC), critic enhancements (~80 LOC), tests (~60 LOC), docs (~40 LOC). Will micro-batch commits.

### LOCALITY
- Changes confined to `tools/wvo_mcp/scripts`, `tools/wvo_mcp/src/critics`, `docs/`, and `state/analytics/override_history/`.

### VISIBILITY
- Archives stored predictably (`override_history/2025-11-06.jsonl.gz` or rolled into monthly folders), critic emits actionable errors.

### EVOLUTION
- Reuses existing critic hook pattern; adds rotation script as new reusable pattern for other logs (future leverage).

**Leverage:** High — affects compliance pipeline and repo hygiene. Demands tests + documentation.

Commit message snippet:
```
Pattern: critic-enforced-rotation
Deleted: n/a
```

---

## Via Negativa Analysis

- Evaluated deleting overrides after review—rejected (loses accountability).
- Considered storing overrides outside Git (e.g., external DB)—adds complexity and breaks transparency. Better to archive within repo but compressed.

---

## Refactor vs Repair

- This is a repair of process gaps via targeted tooling; no large module refactor required.
- Ensure script modular to support future refactors if override logging migrates.

---

## Alternatives

### Alternative 1: Deletion/Simplification Only
- What: Delete overrides after review and rely on daily manual git audits.
- Pros: Zero new code; removes storage concerns.
- Cons: Destroys accountability trail, violates compliance policy, relies entirely on human discipline.
- Why not selected: Accountability and auditability are non-negotiable; this approach creates more risk.

### Alternative 2: CI-only Enforcement
- What: Nightly CI job rotates overrides and checks for untracked files.
- Pros: Centralized automation; no local setup.
- Cons: Feedback arrives hours later, allowing drift; CI downtime would halt enforcement.
- Why not selected: We need immediate guardrails during local work; CI-only is insufficient as primary.

### Alternative 3: Refactor into Central Log Service
- What: Build a persistent service (SQLite or similar) that stores overrides/artifact audits with an API.
- Pros: Single source of truth, richer analytics, could power dashboards.
- Cons: High complexity, new infrastructure surface area, longer timeline than remediation allows.
- Why not selected: Overkill for urgency; we need fast remediation.

### Selected Approach: Script + Critic + Docs
- What: Local rotation script invoked by ProcessCritic + daily checklist template + documentation/ownership updates.
- Why: Delivers immediate feedback, integrates with existing guardrails, can still be automated via Wave0 or cron.
- Trade-offs: Adds tooling/tests but within manageable scope; balances speed and durability.

---

## Complexity Discussion

- Adds new script + critic logic; manageable with tests.
- Archive compression adds slight complexity but reduces repo footprint—worth it.
- Need to document concurrency handling clearly to avoid corruption.

---

## Implementation Plan Highlights

- Script reads JSONL, splits by date, writes archive with gzip, rewrites current log.
- Critic checks file size (bytes) and latest archive timestamp; leverages Node FS.
- Templates ensure each day generates `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/` with review + remediation notes (automation-friendly).
## Scope Estimate & Micro-batching

- **Files to change:** ~8 (rotation script, rotation fixtures/tests, critic module + tests, docs, templates, roadmap/taskflow entry, evidence seed).
- **Estimated LOC:** +220 / -20 overall. Each commit will stay ≤150 net LOC by pairing additions with deletions (e.g., trimming duplicated checklist prose).
- **Micro-batching:** four commits maximum
  1. Commit A — rotation script + fixtures + vitest (≤5 files).
  2. Commit B — critic updates + critic tests (≤5 files).
  3. Commit C — docs/templates/ownership updates (≤5 files).
  4. Commit D — seed daily audit evidence + roadmap/taskflow wiring (≤5 files).

---

## Risks & Mitigations

1. **File corruption during rotation**
   - Mitigation: Write to temp file, fsync, atomic rename.

2. **Critic false positives on new repos**
   - Mitigation: Allow bootstrap window (if no overrides yet, critic only warns).

3. **Archive size growth**
   - Mitigation: Compress and cap entries per archive; roll into monthly bundles and document retention review monthly.

---

## Testing Strategy

- Unit tests: rotation script (with fixture logs), critic enforcement scenarios.
- Integration: Run script via npm script and run critic on mocked git diff to ensure enforcement triggers.
- Manual: Simulate daily rollover (back-to-back runs) to confirm new audit template recognized.

---

## Open Questions

1. Should archives include checksum footers for integrity?
2. Do we need CLI entrypoint for autopilot to trigger rotation automatically each day?
3. Is daily cadence best handled by automation or should there be multiple runs per day (e.g., after every commit)?
