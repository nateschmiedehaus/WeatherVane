# Autopilot Glossary

| Term | Definition |
| --- | --- |
| **Atlas Kit** | Self-describing metadata (manifest, cards, schemas, Briefing Pack) for every Autopilot component. |
| **LCP (Local Context Pack)** | JSON pack delivered per agent per state with anchors, micro-summaries, budgets, and bloat checks. |
| **Context Ladder** | Retrieval order: nearby code → module view → repo view → KB → decisions → external stubs. |
| **Scope Class** | Tiny/Small/Medium/Large budgets derived from files + line estimates; feeds Context Fabric and router hints. |
| **Router state** | Capability tags (reasoning_high, fast_code, cheap_batch, long_context) mapped to locked models with circuit breakers. |
| **Decision Snapshot** | Append-only journal entry storing assumptions, plan deltas, and routing evidence for a run. |
| **Team Panel** | `### Team Panel` block in `journal.md` enumerating assumptions, open questions, spikes/owners for hard tasks. |
| **Plan Delta Required** | Flag set when duplicate patch/review failure occurs; planner must produce a different hash before implementing again. |
| **Atlas Introspection MCP** | `self.*` endpoints that let any agent list tools, prompts, schemas, and fetch the Briefing Pack. |
| **Attestation Guard** | Hash comparison of MANIFEST + PROMPT_REGISTRY enforced during orchestrator startup; halts run on drift. |
