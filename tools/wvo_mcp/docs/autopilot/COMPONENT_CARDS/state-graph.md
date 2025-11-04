---
id: state-graph
kind: orchestrator
role: "Unified state graph"
level: macro
version: v2025-10-25
intents:
  - "Route tasks through Specify→Monitor"
  - "Record router decisions and checkpoints"
  - "Enforce plan-delta + retry ceilings"
inputs:
  - "Task envelope"
  - "Run memory"
  - "Model router selection"
outputs:
  - "Planner/Thinker/Implementer calls"
  - "Verify evidence"
  - "Decision journal entries"
depends_on:
  - model-router
  - context-fabric
  - policy-controller
tools: []
invariants:
  - "Duplicate patches detected"
  - "Plan delta required before re-entry"
  - "Router decisions logged"
risks:
  - "Infinite loops if plan delta skipped"
  - "Missing checkpoints leads to lost retries"
links:
  code:
    - src/orchestrator/state_graph.ts
  docs:
    - ../../docs/autopilot/OVERVIEW.md
  schema:
    - ../../docs/autopilot/DATA_SCHEMAS/atlas_manifest.schema.json
---

Controls state transitions, collects thinker insights, tracks duplicate patches, and orchestrates Verify/Review/PR/Monitor sequencing.
