---
id: roadmap-ops
kind: roadmap
role: "Roadmap operations"
level: meso
version: v2025-10-25
intents:
  - "Create/decompose/replace tasks"
  - "Sync GitHub"
  - "Validate invariants"
inputs:
  - state/roadmap.yaml
  - state/roadmap_inbox.json
outputs:
  - Snapshots
  - "GitHub issues"
  - "Audit entries"
depends_on: []
tools:
  - roadmap.add
  - roadmap.decompose
invariants:
  - "No dependency cycles"
  - "Acceptance never empty"
  - "Parents higher level"
risks:
  - "Drift between roadmap and GitHub"
links:
  code:
    - tools/wvo_mcp/src/state/roadmap_store.ts
    - tools/wvo_mcp/src/planner/planner_engine.ts
  docs:
    - docs/autopilot/ROADMAP_OPS.md
  schema:
    - state/roadmap.yaml
---

Transactional API for manipulating roadmap hierarchy with governance + shadow-plan hooks.
