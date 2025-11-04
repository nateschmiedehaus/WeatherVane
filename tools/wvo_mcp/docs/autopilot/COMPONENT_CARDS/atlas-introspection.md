---
id: atlas-introspection
kind: mcp_tool
role: "Atlas MCP endpoints"
level: micro
version: v2025-10-25
intents:
  - "Describe mission"
  - "List tools"
  - "Serve schemas/prompts"
  - "Return briefing pack"
inputs:
  - "Atlas manifest"
  - "Prompt registry"
outputs:
  - "JSON descriptions"
  - References
depends_on:
  - state-graph
tools:
  - self_describe
  - self_list_tools
  - self_get_schema
  - self_get_prompt
  - self_briefing_pack
invariants:
  - "Pointer-first answers"
  - "Hashes verified"
risks:
  - "Serving stale data if generator not run"
links:
  code:
    - src/atlas/atlas_service.ts
  docs:
    - ../../docs/autopilot/OVERVIEW.md
  schema:
    - ../../docs/autopilot/DATA_SCHEMAS/atlas_manifest.schema.json
---

Provides self-describing metadata so any agent can introspect the Autopilot environment in one hop.
