# Agent README

Use this file as the single entrypoint for any Codex/Claude agent onboarding into the Unified Autopilot.

1. **Read the Briefing Pack** — `docs/autopilot/AGENT_BRIEFING_PACK.json` lists mission, architecture, and pointer files. Load this before touching the repo.
2. **Check Atlas attestation** — Compare `docs/autopilot/MANIFEST.yml` hashes with the files you will edit. If anything changed without a manifest update, run `npx tsx tools/wvo_mcp/src/atlas/generate_atlas.ts` and commit the results.
3. **Call Introspection MCP** — Tools prefixed with `self_` (`self_describe`, `self_list_tools`, etc.) let you fetch mission, prompts, schemas, and the Briefing Pack programmatically.
4. **Sync context** — Fetch `plan_next(minimal=true)` & `autopilot_status` (per CLAUDE.md) before doing work, then rely on Context Fabric for LCPs, edit windows, and governance panels.
5. **Follow guardrails** — Router is locked to Codex 5 / Claude 4.5. Verify state blocks merges unless tests + lint + type + security + license pass with changed-lines coverage.
6. **Document changes** — Update Component Cards or atlas sources when you add/remove modules, prompts, tools, or schemas. Run atlas generator + validator + tests.

### Quick Commands
```
# Rebuild Atlas + Briefing Pack
npx tsx tools/wvo_mcp/src/atlas/generate_atlas.ts

# Validate (used by CI)
npx tsx tools/wvo_mcp/src/atlas/validate_atlas.ts

# Run atlas tests
npx vitest run tools/wvo_mcp/src/atlas/__tests__
```

### Checklist Before Shipping
- [ ] Atlas generator + validator ran with no changes
- [ ] `docs/autopilot/MANIFEST.yml` + `AGENT_BRIEFING_PACK.json` committed
- [ ] Q/A smoke + introspection tests green
- [ ] Attestation guard updated if prompts changed
- [ ] CHANGELOG entry added

This README plus the Briefing Pack should be enough context for any agent to act autonomously.
