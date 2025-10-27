# Codex Agent Handbook (MCP)

**Scope:** This is the system-level playbook for Codex-based agents operating inside the WeatherVane Unified Autopilot. It mirrors `claude.md` but aligns wording and controls for Codex 5. Use it alongside the Atlas Briefing Pack and architecture overview.

---

## Session Startup Checklist
- Call MCP tools `plan_next --minimal` and `autopilot_status`; if either fails run `./tools/wvo_mcp/scripts/restart_mcp.sh` and log to `state/analytics/health_checks.jsonl`.
- Load the latest Atlas Briefing Pack (`docs/autopilot/AGENT_BRIEFING_PACK.json`) and skim `docs/autopilot/OVERVIEW.md#architecture` before touching the code.
- Keep `state/context.md` under 1,000 words; consult backups in `state/backups/context/` only when necessary.
- Use Atlas or Director Dana follow-ups for any consensus-created tasks; do not bypass review gates.
- Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` so TestsCritic records the real pass/fail state before declaring a task finished.

---

## System-Level Architecture Snapshot

### Operating Loop
- States: `Strategize → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor`; complete a full loop in one session.
- Guardrails: lint, tests, type checks, security scans, license compliance, and changed-lines coverage enforced in Verify.
- Memory: run-ephemeral hints, project index (symbols/files), knowledge base resources, and decision journals stored at `resources://runs/<id>/`.

### Agent Roles
- Planner builds the task map from roadmap metadata and scoped context budgets.
- Thinker validates plan deltas and resolves open questions before implementation.
- Implementer applies patches, runs tests, and produces artifacts.
- Verifier executes the gate suite, collects coverage, and enforces retry policy.
- Reviewer consumes inline evaluators and rubrics to gate quality.
- Critical performs adversarial checks and escalates systemic issues.
- Supervisor finalizes PR handoff and monitors post-merge signals.

### Platform Components
- State graph (`tools/wvo_mcp/src/orchestrator/state_graph.ts`) orchestrates retries, leases, and checkpoints.
- Model router locks Codex/Claude calls to approved builds and trips circuit breakers on drift.
- Context Fabric assembles Local Context Packs, edit windows, and handoff bundles (`docs/autopilot/CONTEXT_FABRIC.md`).
- Policy controller applies governance, security, and quality policies defined in Atlas.
- Atlas introspection tracks component hashes (`docs/autopilot/MANIFEST.yml`) for drift detection.
- Roadmap ops integrates consensus tasks with staffing cues (`docs/autopilot/ROADMAP_OPS.md`).

### Knowledge & Evidence Flow
1. Planner pulls roadmap metadata and cache hints to size the work.
2. Context Assembler writes LCPs and evidence bundles to `resources://runs/<id>/context/`.
3. Implementer edits within provisioned windows and logs tool executions to the blackboard.
4. Verifier records gate outputs, router decisions, and coverage deltas for the run ledger.
5. Monitor stage runs synthetic smokes and captures the final decision snapshot.

### Observability & Governance
- Decision journals live at `resources://runs/<id>/journal.md`.
- OpenTelemetry GenAI spans record tool calls, token usage, and latency SLOs (success ≥95%, loop ≤2%, planner→tool p95 ≤1.5s, tool MTTR ≤30s).
- Atlas CI (`.github/workflows/atlas.yml`) blocks merges that violate manifest hashes or documentation integrity.

---

## Execution Protocol

### Complete-Finish Policy
- Finish every task within the active loop—no partial completions or deferred fixes.
- Meet every acceptance criterion; builds must be clean (0 errors/warnings) and all tests must pass with no skips.
- Document as you go; never schedule documentation as a follow-up.
- Catch insufficient tokens or oversized tasks during Plan and escalate before starting.

### Codex Call Stability
- Pin requests to the designated Codex build (e.g., `o4-mini-YYYYMMDD` or `gpt-4.x-YYYYMMDD`) when provided.
- Use deterministic decoding (temperature 0, constrained top-p); log request/response IDs, finish reasons, and provider fingerprints.
- Capture provider headers/version fields and negotiated MCP servers for replayability.

### Integration-First Development
- **Search → Integrate → Verify**: locate existing connectors, configs, or utilities before writing code, extend them, and prove integration with programmatic checks.
- Avoid hardcoding values, duplicating interfaces, or skipping shared helpers (logger, config, cache, storage).

### Control Surfaces
- Supervisor node can pause routing or require human approval; respect lease durations and idempotency keys.
- Blackboard events (`PlanProposed`, `ToolExecuted`, `ReviewAccepted`) must include `task_id`, `agent_id`, `plan_hash`, `parent_event_id`, `idempotency_key`, `schema_version`.
- Loop guard tracks rolling hashes of prompt + plan + tool spec; mutate strategy or escalate if the same loop triggers ≥3 times in 10 minutes.

### Escalation Rules
- Escalate with a loop diary and proposed fix if the same error recurs ≥3 times, no progress >90 minutes, or >5 iterations occur without resolution.

---

## Repo Ops Quick Reference
- Project layout: `apps/api`, `apps/web`, `apps/worker`, `shared`, `tests`, `docs`.
- Primary commands: `make api`, `make web`, `make worker`, `make lint`, `make test`, `make smoke-context`, `python apps/worker/run.py <tenant>`.
- Commit hygiene: present-tense scope tags (e.g., `worker: add retention webhook`); ensure lint/tests pass and attach evidence in PR descriptions.
- Secrets must stay in environment variables; never commit `.env` files.
- Use `JsonStateStore` for connector cursors and validate geocoding coverage before enabling Autopilot for a tenant.

---

## References
- Architecture overview: `docs/autopilot/OVERVIEW.md`
- Briefing pack: `docs/autopilot/AGENT_BRIEFING_PACK.json`
- Tooling index: `docs/autopilot/TOOLBOX.md`
- Policies: `docs/autopilot/SECURITY.md`, `docs/autopilot/QUALITY_BAR.md`, `docs/autopilot/GOVERNANCE.md`
- Integration standards: `docs/autopilot/Integration-Verification.md`
- Complete-finish policy: `docs/autopilot/Complete-Finish-Policy.md`
- Observability: `docs/autopilot/Observability-OTel-GenAI.md`
