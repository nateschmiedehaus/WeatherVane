---
id: model-router
kind: policy
role: "Model router"
level: meso
version: v2025-10-25
intents:
  - "Lock models to Codex 5 + Claude 4.5"
  - "Escalate on circuit-breakers"
  - "Record costs"
inputs:
  - "Router state"
  - "Plan metadata"
outputs:
  - "Model selections per state"
  - "Router decision log"
depends_on: []
tools: []
invariants:
  - "Only allow listed models"
  - "Escalate after repeated failures"
risks:
  - "Prompt injection via unknown provider"
  - "Cost explosion"
links:
  code:
    - tools/wvo_mcp/src/orchestrator/model_router.ts
    - tools/wvo_mcp/src/orchestrator/model_policy.yaml
  docs:
    - docs/MODEL_ROUTING_POLICY.md
  schema: []
---

Chooses codex/claude variants per capability tag and records auditing metadata.
