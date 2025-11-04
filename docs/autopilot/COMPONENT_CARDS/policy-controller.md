---
id: policy-controller
kind: policy
role: "Policy controller"
level: meso
version: v2025-10-25
intents:
  - "Enforce autopilot rules"
  - "Record escalations + incidents"
inputs:
  - "State graph events"
  - "Critical findings"
outputs:
  - "Policy audit entries"
  - "Plan-delta requirements"
depends_on:
  - state-graph
tools: []
invariants:
  - "Incidents opened before bypass"
  - "No secrets surfaced"
risks:
  - "Policies drifting from docs"
links:
  code:
    - tools/wvo_mcp/src/orchestrator/policy_controller.ts
  docs:
    - docs/AUTOPILOT_STATUS.md
  schema: []
---

Bridges governance prompts with runtime enforcement, halting PR flow when guardrails trip.
