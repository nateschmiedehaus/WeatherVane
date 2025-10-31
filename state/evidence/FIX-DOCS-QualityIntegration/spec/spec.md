# SPEC — FIX-DOCS-QualityIntegration

## Scope & Targets
- `CLAUDE.md` Autopilot/quality sections (current §§2–4, 9): reinforce autonomy framing, Phase 0 instrumentation baseline, parity/capability cadence, zero-deferral policy.
- `tools/wvo_mcp/README.md`: extend “Quality Enforcement Integration” to cover baseline collector/checker commands, status surfaces, and escalation triggers.
- `docs/autopilot/WORK_PROCESS.md`: expand “Quality Integration” to include instrumentation expectations, override policy, and links to baseline evidence.
- `docs/autopilot/QUALITY_INTEGRATION_TROUBLESHOOTING.md`: add playbooks for baseline gaps, parity drift, override clearance, and capability sweep hygiene.

## Functional Requirements
1. **Autonomy framing:** Every updated section states how quality integration + instrumentation protects the 100% autonomy objective.
2. **Instrumentation coverage:** Document usage, cadence, and evidence paths for `collect_phase0_baseline.mjs`, `check_phase0_baseline.ts`, enforcement dashboard, and tmux baseline indicator.
3. **Parity & capability alignment:** Keep parity (`autopilot_parity.mjs`) and capability report instructions up-to-date, emphasising Codex/Claude parity and twice-weekly sweeps.
4. **Troubleshooting flow:** Provide step-by-step guidance for common failure states (baseline stale, overrides active, parity drift, capability surprises) with commands and escalation rules.
5. **Loopback & escalation:** Highlight zero-deferral guardrail policy, override expiry expectations, and when to open incidents/escalations.
6. **Cross-linking:** Ensure the four docs link to each other and to Phase 0 instrumentation contract for deeper reference.

## Quality Requirements
- Plain-language, operator-focused instructions; no contradictory legacy statements.
- Link paths and commands verified against repository structure.
- Add or update tables/bullets for quick scanning (e.g., checklists, command tables).
- Include note on baseline freshness threshold (<24h) and location of evidence snapshots.

## Non-Goals
- Revisiting entire WORK_PROCESS document beyond quality integration/related references.
- Building new automation or modifying CLI behaviour (document only).
- Duplicating full Phase 0 instrumentation contract (reference it instead).
