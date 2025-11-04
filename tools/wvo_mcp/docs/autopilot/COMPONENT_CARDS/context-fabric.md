---
id: context-fabric
kind: context
role: "Context Fabric"
level: meso
version: v2025-10-25
intents:
  - "Build Local Context Packs"
  - "Maintain anchors + micro-summaries"
  - "Coordinate team panels + handoffs"
inputs:
  - "File/test hints"
  - "Scope signals"
  - "KB references"
outputs:
  - "LCP JSON"
  - "Team panel markdown"
  - "Handoff packages"
depends_on:
  - state-graph
tools:
  - self_briefing_pack
invariants:
  - "Anchors deduped"
  - "Budget respected"
  - "No secrets written"
risks:
  - "Token overrun"
  - "Stale anchors if hashes ignored"
links:
  code:
    - src/context/context_assembler.ts
    - src/context/context_budgeting.ts
    - src/context/knowledge_navigator.ts
  docs:
    - ../../docs/autopilot/CONTEXT_FABRIC.md
  schema:
    - ../../docs/autopilot/DATA_SCHEMAS/local_context_pack.schema.json
---

Combines budgeting, navigator, and persistence utilities to keep context pointer-first and within token budgets.
