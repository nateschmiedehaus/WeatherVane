# Prompt Registry

| ID | Version | Path | Summary |
| --- | --- | --- | --- |
| `dod_pr` | v2025-10-23 | tools/wvo_mcp/prompts/dod_pr.md | Definition of Done + PR evidence template enforced before PR creation. |
| `reviewer_rubric` | v2025-10-23 | tools/wvo_mcp/prompts/reviewer_rubric.md | Reviewer rubric JSON (readability, maintainability, perf, security + actionables). |
| `context_system` | v2025-10-23 | docs/CONTEXT_SYSTEM.md | Pointer-first context ladder + budgets specification. |
| `atlas_kit` | v2025-10-25 | docs/autopilot/AGENT_README.md | Quickstart instructions for any agent bootstrapping inside the repo. |

Hashes for each prompt live in `docs/autopilot/MANIFEST.yml` and are verified by the attestation guard during orchestrator startup.
