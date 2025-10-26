# Autopilot FAQ

**Q: Which models can the router select?**
Only `codex-5-high|medium|low` and `claude-sonnet-4.5|claude-haiku-4.5|claude-opus-4.1`. Others are rejected with a policy error recorded in the decision journal.

**Q: Where do I find the reviewer rubric and DoD prompts?**
See `docs/autopilot/PROMPT_REGISTRY.md` for canonical IDs and hashes; the underlying prompt files live in `tools/wvo_mcp/prompts/`.

**Q: How do I understand a subsystem quickly?**
Open `docs/autopilot/COMPONENT_CARDS/<id>.md`. Each card has front-matter describing role, intents, dependencies, risks, and links to code/docs/schemas.

**Q: How do agents obtain context without blowing token limits?**
Each state calls the Context Assembler which builds LCPs capped by scope/model budgets. Agents use anchors + micro-summaries and can request expansions via the Context Fabric APIs.

**Q: What proves Atlas is up to date?**
`tools/wvo_mcp/src/atlas/generate_atlas.ts` regenerates manifest/cards/briefing pack. CI (`.github/workflows/atlas.yml`) runs generator + validator and fails if hashes drift.

**Q: How do I fetch the Briefing Pack programmatically?**
Call MCP tool `self_briefing_pack`; it returns the path `docs/autopilot/AGENT_BRIEFING_PACK.json` plus metadata. Alternatively load it from git for offline onboarding.

**Q: How do I add a new tool/prompt?**
Update the relevant config in `tools/wvo_mcp/src/atlas/atlas_sources.ts`, run the generator, and commit the updated MANIFEST + PROMPT_REGISTRY hashes.

**Q: What happens if MANIFEST hashes differ from disk?**
`OrchestratorRuntime` checks attestation during startup. A mismatch halts the worker, writes an incident template, and asks for a remediation PR.

**Q: Where do governance decisions live?**
Atlas cards link to RFC/ADR docs under `docs/autopilot/` and decision snapshots in `resources://runs/<id>/journal.md`.

**Q: How do I run the sanity questions/test?**
`npx vitest run tools/wvo_mcp/src/atlas/__tests__/atlas_qna.test.ts` executes the ten canned questions and verifies every answer is served via Briefing Pack pointers.
