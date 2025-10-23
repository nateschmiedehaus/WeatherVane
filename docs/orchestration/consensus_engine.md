# Hierarchical Consensus & Escalation Engine Design

## Objectives

1. **High-Signal Decisions** – Provide an explicit consensus ritual for complex/ambiguous work before execution begins.
2. **Predictable Escalation** – Route disagreements or stalled deliberation to the right leaders (Dana, Atlas, Research Orchestrator) with structured context.
3. **Learning Loop** – Capture decision artifacts that critics and autopilot can reference later, feeding staffing telemetry and charter enforcement.

## Core Concepts

### Decision Types

| Type | Examples | Default quorum |
| --- | --- | --- |
| **Critical** | Production hotfix, schema change, security policy | 3 votes (Atlas + Claude + domain critic) |
| **Strategic** | Roadmap reprioritisation, architecture shifts | Dana + Atlas + Research Orchestrator |
| **Specialist** | ML experiment redesign, design overhaul | Atlas + Specialist critic + relevant council member |

### Participants

- **Council** – ClaudeCode delegates that specialise in strategy/reasoning (architect, reviewer archetypes).
- **Facilitator** – Atlas by default; can be delegated to Research Orchestrator for ML-heavy work.
- **Critic Advisors** – Domain critics with `authority: blocking/critical`; automatically seeded when their critic fails on the item.

### Hierarchical Escalation & Delegates

- `agenda_builder` now inspects critic identity metadata (`identity.authority`, `identity.preferred_delegates`) and upgrades the quorum when a critic raises blocking or critical findings. A `critical` authority forces a critical consensus and automatically seats Director Dana, security critic, and the critic persona alongside Atlas/Claude.
- Follow-up tasks created by critics keep their own metadata (`critic`, `call_agents`, `escalate_to`, `delegate_agent`). These fields are normalised into agenda participants so Operations Steward, Autopilot, or other named delegates are pulled into the same decision ritual instead of being pinged ad-hoc later.
- Hierarchy is enforced in `shouldEnsureDecision`: critical or blocking critic follow-ups (and any task marked with `severity: director`) now require a consensus round even if the task status is still `pending`, making director-level escalations explicit before work resumes.

### Signals & Inputs

- Task metadata (status, complexity, critic failures, delegate metadata).
- Critic persona identities (from `critic_identities.json`).
- Telemetry: rate limits, token usage, performance monitor reports.

## Architecture

```
StateMachine Task → ConsensusEngine.enrichDecisionContext()
                    ↘ Candidate agents (AgentPool)
                    ↘ Critic performance history
ConsensusEngine.run()
  1. Generate agenda via heuristics (critic failures, task complexity, live flags)
  2. Request proposals from council participants (Claude)
  3. Score proposals (supports quorum, considers cost/quality heuristics)
  4. Emit DecisionArtifact to state_machine.addContextEntry()
  5. Trigger escalation if quorum fails (Autopilot/Dana follow-up tasks)
```

### Module Plan

- `src/orchestrator/consensus/consensus_engine.ts`  
  - `runConsensus(task, context, options)`  
  - `evaluateQuorum(participants, proposals)`  
  - `recordDecision(decision, metadata)` – uses `stateMachine.addContextEntry`
- `src/orchestrator/consensus/agenda_builder.ts` – builds agenda based on critic failures, telemetry, live flags.
- Integrate with `AgentCoordinator`:
  - Before dispatching a `needs_review` / high-complexity task, call `consensusEngine.ensureDecision(task, context)`.
  - If decision missing or stale, run consensus; otherwise proceed.

### Activation & Controls

- Consensus orchestration is feature-flagged via the live flag `CONSENSUS_ENGINE` (stored in `state/orchestrator.db`). The default value is `1`, so the coordinator activates consensus automatically after boot.
- Set the environment variable `WVO_CONSENSUS_ENABLED=0` to force-disable consensus even if the live flag remains on; use `WVO_CONSENSUS_ENABLED=1` to opt in explicitly when the flag is off (e.g., during phased rollouts or simulations).

### Workload Signals Integration

- Agenda builder now loads `state/analytics/consensus_workload.json` to align decision type, quorum participants, and token envelopes with live telemetry.
- Escalation signals (duration >900 s, retries >1) automatically promote quorums to include Director Dana, Security critic, or Research Orchestrator as recommended.
- Consensus decisions embed workload metadata (expected duration, token budget, triggered signals) and route follow-up tasks to Dana when escalation triggers fire.

### Data Model

```ts
interface ConsensusDecision {
  id: string;
  taskId: string;
  type: 'critical' | 'strategic' | 'specialist';
  proposals: Array<{
    author: string;
    summary: string;
    risks: string[];
    recommendation: string;
    costEstimate?: number;
    effortEstimate?: number;
  }>;
  selectedProposalIndex?: number;
  quorumSatisfied: boolean;
  escalatedTo?: string[];
  metadata: Record<string, unknown>;
}
```

Persist decisions in `context_entries` (entry_type = `decision`, topic = `Consensus decision:<task>`).

## Decision Flow

1. **Trigger** – Task flagged by agenda builder (e.g., `needs_review`, critic failure, or live flag override).
2. **Participant Selection** – `consensusEngine` chooses participants:
   - Base: Atlas, corresponding critic persona, strategist (Claude).
   - Additional: Research Orchestrator (ML), Director Dana (product).
3. **Proposal Gathering** – Each participant uses prompt templates (e.g., `consensus_prompt.md`) to propose.
4. **Scoring** – Weighted factors:
   - Critic severity (critical > advisory)
   - Historical success ratio for participant on similar tasks
   - Token/cost budgets (prompt_budget critic)
5. **Outcome** – If quorum satisfied:
   - Record decision
   - Optionally auto-create execution or follow-up tasks (via stateMachine.createTask)
   - Notify autopilot store for staffing telemetry.
   - If not satisfied within `CONSENSUS_TIMEOUT_MS`, escalate:
     - `critic_performance_monitor` for critic-specific issues
     - `Director Dana` / `Autopilot` follow-up if strategic impasse

## Integration Phases

1. **Phase 1 (This PR cycle)**  
   - Add module scaffolding (`consensus_engine.ts`) with agenda builder stub, context recording, and tests.
   - Ensure `AgentCoordinator` checks for decisions on critical tasks (feature flag `CONSENSUS_ENABLED`).
2. **Phase 2**  
   - Wire into task dispatch pipeline; generate prompts for Claude/critics to gather proposals automatically.
   - Add telemetry + critic hooks (integration_fury exit criteria).
3. **Phase 3**  
   - Simulation harness (T3.3.3) uses consensus logs to replay decision outcomes, evaluate throughput.
   - Staffing telemetry pipeline (T3.3.4) consumes decision artifacts for learning loops.

## WeatherOps Integration (2025-10)

- FastAPI exposes `/v1/operations/consensus`, returning the normalised workload snapshot (quorum tiers, escalation signals, token budgets) consumed by the product surfaces.
- WeatherOps dashboard renders a consensus summary card alongside guardrail telemetry, highlighting tier participants, escalation triggers, and execution health so Atlas and Dana can validate staffing at a glance.
- `/v1/operations/orchestration-metrics` exposes the dynamic staffing telemetry snapshot (decision history, type mix, token budgets) generated by the MCP recorder.
- WeatherOps dashboard includes a staffing telemetry panel (`StaffingTelemetryPanel`) that surfaces decision mix, recent history, staffing guidance, and escalation signals directly from the metrics endpoint so Atlas and Director Dana can audit learning loops without leaving the product.
- API responses mirror the MCP workload schema (`state/analytics/consensus_workload.json`) and power automated regression coverage across both Vitest and pytest suites.

## Testing Strategy

- **Unit** – Mock state machine + agent pool to verify quorum paths, escalation triggers, and context entries.
- **Integration** – Run `npx vitest run src/tests/consensus_engine.test.ts` (to be created) verifying decisions recorded and escalations created.
- **Critics** – `critic integration_fury` to ensure cross-service dependencies remain stable; keep context freshness via regular roadmap grooming instead of the retired `manager_self_check` critic.

## Immediate Actions

1. Implement Phase 1 scaffolding using the above APIs.
2. Update roadmap entry `T3.3.2` status to `in_progress` once scaffolding lands.
3. Incorporate consensus into autopilot retrospectives (include decisions in weekly brief).
