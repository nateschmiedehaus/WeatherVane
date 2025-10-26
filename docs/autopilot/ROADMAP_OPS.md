# Roadmap Operations (Atlas Snapshot)

The roadmap stack is managed through MCP tools (add/decompose/replace/move/split/etc.) exposed in `toolbox`. Atlas tracks where each op is implemented:

- **Schema & store:** `tools/wvo_mcp/src/roadmap/roadmap_schema.ts` and `roadmap_store.ts` keep the hierarchical YAML (tasks/stories/epics) consistent and snapshot every change.
- **Ops API:** `tools/wvo_mcp/src/roadmap/roadmap_ops.ts` exposes atomic operations that validate invariants (no dependency cycles, parent level > child level, acceptance not empty).
- **Governance hooks:** Reframe state (+ RFC/ADR) must approve meso/macro pivots. Atlas cards reference the relevant governance docs.
- **GitHub sync:** `tools/wvo_mcp/src/roadmap/roadmap_git_sync.ts` mirrors roadmap IDs to issues/PRs/projects.
- **Triage:** Inbox suggestions go through `roadmap_triage.ts` where dedupe + scoring decide whether to promote items.

When editing roadmap behaviour, update the related component card and rerun the atlas generator so the manifest stays in sync.
