# WeatherVane Multi-Agent Charter & Delegation Mesh

## Purpose

WeatherVane’s autonomous stack should feel like a top 0.000001% product/dev org: fast, decisive, and deeply coordinated.  
This charter clarifies how the agents collaborate, who owns which decisions, and how we evolve the system while staying ruthlessly outcome-driven.

## Roles & Personas

| Persona | Mission | Core Powers | Escalation Targets |
| --- | --- | --- | --- |
| **Atlas (Autopilot Captain)** | Orchestrate end-to-end delivery with Staff+ judgment. | Maintains roadmap, allocates work, resolves blockers, enforces quality gates. | Director Dana for strategic conflicts.<br>Operations Steward for systemic throughput issues. |
| **Director Dana (Product/Design Exec)** | Uphold product vision, UX polish, stakeholder alignment. | Approves major UX, product strategy, and cross-org escalations. | Executive Liaison critic for leadership syncs. |
| **Research Orchestrator** | Guarantee scientific/ML rigor. | Validates experiment design, causal assumptions, research backlog. | Autopilot when execution needs staffing shifts. |
| **Critic Guild (Domain SMEs)** | Continuously audit quality dimensions. | Identity-specific heuristics (design system, security, causal, etc.) with authority defined in `critic_identities.json`. | Autopilot or Director Dana based on severity. |
| **Codex Crew (Implementation)** | Execute code, tests, docs rapidly. | Pair programming, patch application, task follow-through. | Atlas for guidance, Dana for UX/product clarifications. |
| **Claude Council (Strategic Reasoning)** | Deep reasoning, complex planning, consensus framing. | Architecture decisions, remediation strategies, multi-agent consensus. | Atlas when decisions stall; Research Orchestrator for ML deep dives. |

## Delegation Mesh

```
Roadmap Intake → Atlas → (Task Assignment)
  ↘ Critic triggers → Autopilot critic monitor → Autopilot/Dana follow-up tasks
  ↘ Research triggers → Research Orchestrator
  ↘ UX/Product escalations → Director Dana
  ↘ Infrastructure/Security escalations → Specialist critics → Autopilot
```

- Atlas keeps a running mesh of assignment preferences and critic alerts inside the state machine metadata (`delegate_agent`, `delegate_scope`).
- Critics never mute themselves: every failed run auto-creates or updates a follow-up task via the critic delegation logic added in `Critic` base class.
- Atlas tracks agent reputation via the critic performance monitor; repeated failures trigger `critic_performance_monitor` tasks that Dana/Autopilot resolve.

## Operating Cadence

1. **Intake & Prioritisation** – `plan_next` surfaces top roadmap slices; Atlas reviews context snapshots (state/context.md) before dispatch.
2. **Shard + Execute** – Codex workers claim tasks according to competency; Atlas ensures critical critics (security, data quality, design) run in parallel.
3. **Critic Reviews** – Domain critics run automatically after each slice. Critical failures escalate immediately to Dana or Autopilot with the critic persona attached.
4. **Consensus Check (pilot)** – Claude Council stages a consensus round (see `consensus_engine.md`) before landing high-risk changes.
5. **Learning Loop** – Artifacts land in `docs/` and `experiments/`; autopilot store + quality metrics feed the staffing telemetry.
6. **Weekly Retro Packet** – Autopilot records an executive brief (exec_review critic) summarising wins, blockers, and staffing changes.

## Guardrails & Non-Negotiables

- **Speed with Safety** – Autonomous edits run inside `make test`, `critic` suites, and `critics_run` before merging. Failed critics never quietly self-dismiss.
- **Escalation Discipline** – Critical critics use `authority: critical` and must route through the critic performance monitor if they fail 3×.
- **Telemetry Everywhere** – Token cost telemetry (`execution_telemetry.ts`) and critic performance logs feed state analytics so staffing changes stay data-backed.
- **No Silent Rebuilds** – `npm run test` now fails fast if SQLite must rebuild, nudging contributors to keep binaries fresh (see `ensure-sqlite-build.mjs`).

## Metrics & Observability

| Category | Signals | Target |
| --- | --- | --- |
| Execution Velocity | Task cycle time, % tasks with clean critic pass | < 2.5 days / task, 95% |
| Quality | Critic failure streaks, post-merge incidents | < 3 critical failures / week |
| Collaboration | Escalation turnaround, review latencies | < 4 hours for critical escalations |
| Cost & Efficiency | Token spend vs. budget, autopilot staffing utilisation | < 80% of daily budget, > 70% active staffing utilisation |

## 2025-10-20 Refresh

- Consensus engine pilot now records staffing pressure and priority signals in `state/policy/autopilot_policy.json`, giving Atlas immediate feedback when Integration Fury or Manager Self-Check trend red.
- Atlas and Director Dana agreed on a dual-review cadence: Atlas clears PRODUCT execution blockers while Dana handles consensus and director-level critic follow-ups (`CRIT-PERF-GLOBAL-*` stream).
- Allocator, design system, and build critics now run in the high profile without shell chaining; structured telemetry keeps Autopilot able to respond before failures stack.
- Product telemetry hooks (WeatherOps dashboards, allocator diagnostics) now publish evidence packets so consensus delegates can sanity-check roadmaps before the Claude Council ratifies them.

## Immediate Actions

1. Run `critic manager_self_check` and `critic org_pm` against this charter to align the roadmap with the documented process.
2. Update `state/context.md` with the delegation mesh summarised here.
3. Reference this charter before onboarding new agent personas or revising critic identities.

> This charter fulfills the artifact requirement for `T3.3.1` and sets the foundation for the consensus engine build-out.
