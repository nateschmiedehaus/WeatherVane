# Strategy – Task 13 OUTCOME-LOG (2025-11-05)

## Goal
Instrument outcome logging so every orchestrated task produces a rich record that powers SCAS metrics, learning loops, and post-hoc analysis. The logging has to capture budgets, prompt metadata, guardrail activity, and stigmergic signals and must be safe to roll out gradually.

## Current Reality
- There is **no dedicated outcome logger** in `tools/wvo_mcp/src`. Task completions are handled inside `AgentCoordinator.handleExecutionResult`, producing telemetry (`ExecutionSummary`) but nothing writes to `state/analytics/task_outcomes.jsonl`.
- Token usage, duration, quality, and critic info are already computed inside `handleExecutionResult`, so those can seed the new outcome record.
- Budgets, guardrail adjustments, and stigmergic data are **not tracked anywhere yet**. Task metadata may contain estimates, but there is no schema.
- Feature flag infrastructure (`FeatureGates`, live flags) already exists and can gate outcome logging.
- `state/analytics/` currently lacks `task_outcomes.jsonl`; downstream SCAS metrics rely on it being populated by this task.

## Constraints & Risks
- We must not block task completion on logging; the logger must degrade gracefully if data is missing or file writes fail.
- Much of the desired metadata is optional today. The schema must accept partial data while encouraging future producers to populate fields.
- Guardrail adjustments and stigmergic signals will mature in later tasks; we need an API surface now that future features can plug into without schema churn.
- Writing to JSONL must be atomic to avoid corruption in crashes; we should reuse existing append helpers (`appendToJSONL`) or add a small utility.
- We cannot introduce heavy dependencies (e.g., new DB). Plain JSONL + fs append is the expected pattern.

## Strategic Options
1. **Minimal wrapper around `ExecutionSummary`** – log the current summary with minor additions. Pros: fast. Cons: misses new fields; future tasks would require schema migrations. *Rejected* (fails requirements).
2. **Dedicated outcome logger module** with explicit `TaskOutcome` interface, translation layer pulling data from orchestrator, gracious defaults, and hooks for optional producers. *Chosen.*
3. **Central analytics bus** where all telemetry publishes to an event emitter that multiple loggers consume. Pros: extensible; cons: large refactor, out-of-scope for single task. *Rejected for now*.

## High-Level Approach
1. Create `tools/wvo_mcp/src/analytics/task_outcome_logger.ts` to define the `TaskOutcome` interface, helper types for budgets/prompt metadata/guardrails/stigmergy, and `logTaskOutcome()` that appends to `state/analytics/task_outcomes.jsonl`.
2. Add a light-weight `OutcomeBuilder` inside the module (or adjacent) that accepts raw orchestrator state and returns a normalized `TaskOutcome`, filling defaults (`null`/empty arrays) when data is missing.
3. Extend `AgentCoordinator.handleExecutionResult` to assemble the outcome by combining task metadata, execution metrics, quality results, critic info, continuous token metrics, and context info. Introduce small helper functions if needed to keep the method readable.
4. Introduce a feature flag (`ENABLE_OUTCOME_LOGGING`) via `FeatureGates` and live flags. Default to enabled but allow operators to disable quickly.
5. Provide unit tests covering the builder + file append paths with golden fixtures (snapshot JSON). Ensure tests assert optional field behavior (guardrails absent, budgets absent).
6. Add CLI query script (`tools/wvo_mcp/scripts/analyze_outcomes.ts`) to slice outcomes (success rate, grouped by task type) per acceptance criteria.
7. Capture artifacts: sample JSONL entry, test outputs, feature flag documentation.

## Key Questions / Follow-ups
- **Where do estimated budgets come from?** Currently not stored. Strategy: read from `task.metadata?.budgets` if present; otherwise fallback to `task.metadata?.token_budget_estimated`, etc. Leave as `null` when unknown so future tasks can populate.
- **Guardrail adjustments source?** Pending Tasks 18–20. For now expose an input hook (e.g., accept adjustments array from caller) but log empty array unless orchestrator populates metadata. Document expectation for future tasks.
- **Stigmergic signals detection?** Later tasks will compute influence relationships. For this task we can infer `influenced_by_task` from context assembler (if `context.relatedTasks` contains `task.metadata?.influencedBy`). Need a sensible placeholder: use `context.relatedTasks` focusing on ones marked as evidence in metadata, else keep `undefined`.

## Why this is Worth Doing Now
- SCAS metrics (Wave 2) depend on accurate task outcomes; without this instrumentation, later metrics tasks have no data.
- Logging at completion keeps overhead low versus reconstructing from diffed evidence later.
- Establishing the schema now creates the contract other tasks (feedback tracking, resilience, stigma) will rely on, reducing future migrations.

## Kill / Pivot Triggers
- If we discover no reliable token or duration data inside the orchestrator, we might pause and first add telemetry instrumentation (but exploratory review shows data exists).
- If file writes show high contention (unlikely), consider batching outcomes in memory before writing; monitor first.

## Integration Considerations
- Ensure logger path respects workspace root (some setups run autopilot outside repo root).
- Align `TaskOutcome` interface with future documentation in Task 7 (state/README) to avoid divergence.
- Make analyze script resilient to huge files by streaming lines (Node readline) instead of reading entire file into memory.

