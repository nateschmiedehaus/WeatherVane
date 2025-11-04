# Context Fabric Snapshot

Context Fabric assembles scoped knowledge for every agent state.

- **Assembler:** `tools/wvo_mcp/src/context/context_assembler.ts` orchestrates budgeting, anchor collection, dedupe, and persistence to `resources://runs/<id>/context/`.
- **Budgeting:** `context_budgeting.ts` classifies scope (Tiny–Large) from file/line hints and maps capability tags (fast_code, reasoning_high, etc.) to token ceilings per role.
- **Schemas:** `docs/autopilot/DATA_SCHEMAS/local_context_pack.schema.json` defines the contract enforced by Zod before writing any LCP.
- **Navigator:** `knowledge_navigator.ts` fetches code/test/K-B/decision anchors with hash freshness + line spans.
- **Team context:** `team_context.ts` updates `journal.md` (`### Team Panel`) and writes handoff packages at `resources://runs/<id>/handoff/<from>→<to>.json`.
- **Governance LCP:** Additional builder invoked during Reframe state summarizing evidence, detectors, and RFC/ADR references.

Changes to any of these files must update the component cards + manifest to keep Atlas synchronized.
