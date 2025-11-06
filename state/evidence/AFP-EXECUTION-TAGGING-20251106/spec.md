# Spec — AFP-EXECUTION-TAGGING-20251106

## Acceptance Criteria

1. **Metadata File**
   - `state/evidence/<TASK-ID>/metadata.json` includes `execution_mode` (`"autopilot"` or `"manual"`), plus timestamp of last update.

2. **Wave 0 Automation**
   - Wave 0 runner automatically writes `execution_mode: "autopilot"` when it completes a task.

3. **Manual Tagging CLI**
   - A CLI/script exists for humans to run `node tools/wvo_mcp/scripts/set_execution_mode.mjs <TASK-ID> manual|autopilot`.
   - Script updates/creates metadata file and logs success/failure.

4. **Documentation Updates**
   - AGENTS/claude checklists mention tagging execution mode when closing a task.

## Non-Functional Requirements

- Metadata updates should be idempotent.
- Script must exit non-zero on invalid task ID or mode.
- Keep implementation within AFP guardrails (≤5 files per commit, ≤150 net LOC).

## Out of Scope

- Retrofitting execution mode for historical tasks (can be addressed later).
- Guardrail enforcement (will hook in after tagging mechanism exists).
