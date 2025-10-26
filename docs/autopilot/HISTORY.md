# Unified Autopilot History

| Date | Change | Why it mattered |
| --- | --- | --- |
| 2025-08 | Legacy Codex autopilot merged with Claude council | Reduced duplicated prompts and made router decisions explicit. |
| 2025-09 | Verify state began enforcing changed-lines coverage + anti-greenlight rules | Blocked "noop" fixes and forced test evidence. |
| 2025-10-15 | Context Fabric shipped (LCPs + Knowledge Navigator) | Ended prompt bloat while keeping agents scoped to relevant files/tests. |
| 2025-10-20 | Critical agent + policy controller parity | Added adversarial review + policy enforcement before PR creation. |
| 2025-10-23 | Unified Atlas Kit (this change) | Repository is now self-describing with manifests, introspection MCP, and CI drift guards. |

## Themes
- **Resolve, don’t stall:** Every failure (Verify, Review, Monitor) generates evidence + plan delta.
- **Pointer-first context:** Agents never see entire files; they get anchors, budgets, and references.
- **Locked routing:** Only Codex 5 (high/medium/low) and Claude 4.5 (sonnet/haiku/opus) are allowed; others are dropped.
- **Transparent governance:** RFC/ADR references are stored in Atlas manifests and decision snapshots.

Use this history to explain *why* patterns exist before replacing them.
