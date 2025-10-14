  #!/usr/bin/env bash
  set -euo pipefail

  WORKDIR="/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane"
  SCHEMA_FILE="$(mktemp)"
  PROMPT_FILE="$(mktemp)"

  cat <<'SCHEMA' > "$SCHEMA_FILE"
  {
    "type": "object",
    "properties": {
      "completed_tasks": { "type": "array", "items": { "type": "string" } },
      "in_progress": { "type": "array", "items": { "type": "string" } },
      "blockers": { "type": "array", "items": { "type": "string" } },
      "next_focus": { "type": "array", "items": { "type": "string" } },
      "notes": { "type": "string" }
    },
    "required": ["completed_tasks", "in_progress", "blockers", "next_focus", "notes"],
    "additionalProperties": false
  }
  SCHEMA

  cat <<'PROMPT' > "$PROMPT_FILE"
Operate autonomously as the WeatherVane super-team. Your goal is to drive the roadmap to completion with world-class engineering, data/ML, product, and design rigor.

Loop:
- Keep command outputs focused on repo sources; skip runtime caches (`.accounts/`, `tmp/`, `node_modules/`) so prompts stay compact.
- Skim cached task memos in `state/task_memos/` before reloading large docs; update them when plans shift.

1. Read state/roadmap.yaml and choose the highest-priority task(s) not done.
  2. For each chosen task:
     a. Audit docs/code/tests/design to understand requirements.
     b. Implement the work via fs_read, fs_write, and cmd_run (code + tests + docs + design polish). Keep slices small enough to verify quickly.
     c. Run critics_run with ["build","tests","manager_self_check","data_quality","design_system","org_pm","exec_review"] and add allocator/causal/forecast critics when relevant.
     d. Fix issues. If blocked, log the blocker clearly and mark the task blocked with plan_update.
     e. Record decisions, risks, and next actions via context_write (keep state/context.md ≤ 1000 words).
     f. Snapshot via context_snapshot.
     g. Update roadmap status with plan_update only after exit criteria are satisfied.
  3. Repeat on remaining tasks. Stop only when no further progress is possible without human intervention (credentials missing, legal risk, etc.).

  Maintain production readiness, enforce ML/causal rigor, polish UX, and communicate like a Staff+/startup leader.

  Return JSON summarizing completed tasks, tasks still in progress, blockers, next focus items, and overall notes.
  PROMPT

  cd "$WORKDIR"
  codex exec \
    --profile weathervane_orchestrator \
    --model gpt-5-codex \
    --full-auto \
    --sandbox danger-full-access \
    --output-schema "$SCHEMA_FILE" \
    "$(cat "$PROMPT_FILE")"

  rm -f "$SCHEMA_FILE" "$PROMPT_FILE"
