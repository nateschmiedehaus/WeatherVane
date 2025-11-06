# Design: AFP-EXECUTION-TAGGING-20251106

> **Purpose:** Define how tasks record whether they were executed manually or via Wave 0 autopilot, enabling future guardrails and analytics.

---

## Context

Evidence bundles currently lack execution metadata. We want to know whether Wave 0 completed a task or a human did, so we can enforce different policies and track automation adoption. The design introduces a metadata JSON file per task, produced automatically by Wave 0 and via a manual tagging CLI.

---

## Five Forces Check

### COHERENCE
- Reuse `state/evidence/<TASK-ID>/` structure; no new directories.
- Wave 0 runner already updates roadmap/status—add metadata write alongside that step.

### ECONOMY
- Keep metadata minimal: `{ execution_mode, lastUpdatedAt, lastUpdatedBy }`.
- CLI script shares utilities with existing scripts; no new dependency.

### LOCALITY
- Metadata lives in each task’s evidence folder, close to plan/spec/etc.
- Tagging script sits under `tools/wvo_mcp/scripts/`.

### VISIBILITY
- Execution mode visible in metadata; easy to inspect manually or via guardrail monitor.

### EVOLUTION
- Pattern becomes a foundation for future guardrails (ProcessCritic can check metadata later).

**Leverage:** Medium-high — affects audit trail for every task.

---

## Via Negativa

- Do not proliferate new tracking files; use a single metadata JSON.
- Avoid writing large telemetry; only small JSON per task.

---

## Refactor vs Repair

- Repair: bolting on metadata where missing.
- Wave 0 change ensures autopilot writes metadata automatically (no manual patching).

---

## Alternatives Considered

### Alternative 1 — Roadmap Annotation
- **What:** Add `execution_mode` field directly in `state/roadmap.yaml`.
- **Pros:** Central visibility.
- **Cons:** Roadmap becomes noisy, editing YAML for every task is error-prone, history lost once task removed.

### Alternative 2 — Central Telemetry Only
- **What:** Write execution mode to a global analytics JSONL.
- **Pros:** Easier to aggregate across tasks.
- **Cons:** Evidence bundles still lack info; impossible to audit a task in isolation.

### Selected Approach — Per-Task Metadata
- **What:** Store execution mode in `state/evidence/<TASK-ID>/metadata.json`.
- **Pros:** Evidence-local, easy for guardrails to validate, allows both autopilot and manual flows.
- **Why:** Balances visibility and maintainability; metadata travels with task history.

---

## Complexity

- Added complexity limited to metadata writes and CLI script; manageable.
- Ensure metadata writes run in try/finally to avoid partial state.

---

## Implementation Plan Snapshot

- Add helper to Wave 0 runner: `updateExecutionMetadata(taskId, mode, source)` (called before final status update).
- Create CLI script `set_execution_mode.mjs` for manual tagging (`node ... <TASK-ID> manual|autopilot`).
- Update docs/checklists with new tagging step.
- Capture evidence showing manual tagging + Wave 0 tagging.

### Scope Estimate & Micro-batching
- Files touched: ~5 (Wave 0 runner, new CLI, docs updates, evidence).
- Estimated LOC: ~150 additions / minimal deletions.
- Batching plan:
  1. CLI script + docs updates.
  2. Wave 0 runner metadata writer (+ tests if needed).
  3. Evidence updates.

---

## Risks & Mitigations

1. **Metadata race** — sequential writes; risk minimal since tagging infrequent.
2. **CLI misuse** — script validates task ID exists; warns if metadata already set to same value.
3. **Wave 0 silent failure** — log errors when metadata write fails so guardrail monitor can catch.
