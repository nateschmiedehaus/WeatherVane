# STRATEGY: w0m1-supervisor-agent-integration

**Set ID:** w0m1-supervisor-agent-integration
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Autopilot's core orchestration layer was stripped during refactoring, leaving no way for autonomous agents to:
- Acquire tasks from the roadmap
- Coordinate with each other (supervisor → agent relationship)
- Track task lifecycle (selected → assigned → started → completed)
- Integrate cleanly with existing autopilot infrastructure

**Current state:**
- Autopilot infrastructure exists but supervisor/agent scaffolding removed
- No orchestration layer for task distribution
- No lifecycle telemetry for tracking autonomous work
- Agents cannot self-organize around roadmap tasks

**Pain points:**
1. **No autonomous task pickup** - Autopilot can't select and execute roadmap tasks without manual intervention
2. **No coordination** - Multiple agents would conflict (no lease management)
3. **No observability** - Can't track what autopilot is doing (no lifecycle events)
4. **Integration gaps** - Clean-room autopilot doesn't integrate with existing infrastructure

---

## Root Cause

**Why does this gap exist?**

**Historical:**
- Autopilot was prototyped rapidly with monolithic architecture
- Refactoring stripped supervisor/agent structure to start fresh
- Infrastructure (tools, MCP) kept, orchestration removed

**Systemic:**
- No clear separation of concerns (orchestration vs execution)
- Tight coupling between task selection and execution
- Missing abstraction layers (supervisor, agents, lifecycle)

**The core issue:** **Autopilot needs orchestration layer to transition from manual to autonomous operation**

---

## Goal / Desired Outcome

**Establish core autopilot orchestration:**

### 1. Supervisor Scaffold Operational
- Supervisor can read roadmap and select next task
- Lease management prevents duplicate work
- Lifecycle telemetry tracks task progress (4 events: selected, assigned, started, completed)
- Evidence capture for all autonomous work

**Measurable:** Supervisor can autonomously pick task from roadmap and emit lifecycle events

### 2. Agent Scaffold Operational
- Agents can receive task assignments from supervisor
- Agents execute work process (STRATEGIZE → MONITOR)
- Agents report status back to supervisor
- Multiple agent types supported (researcher, implementer, reviewer)

**Measurable:** Agent successfully executes assigned task end-to-end

### 3. Integration Validated
- Supervisor + agents work together (not just independently)
- Live test with Wave 0 runner confirms integration
- Lifecycle events flow correctly (supervisor → agent → completion)
- Evidence bundles generated for autonomous work

**Measurable:** TEST-SUPERVISOR-INTEGRATION-001 passes (verification task)

### 4. Clean-Room Autopilot Merged
- New autopilot scaffold integrates with existing infrastructure
- MVP strangler pattern replaces old autopilot cleanly
- No regression in existing functionality
- Migration path documented

**Measurable:** Autopilot runs using new scaffold, old code removed

---

## Strategic Urgency

**Why now?**

1. **Foundation for autonomy** - Can't have 4+ hour autonomous operation without orchestration
2. **Blocks downstream work** - Agent implementation, memory, DPS all depend on scaffold
3. **Wave 0 requirement** - Exit criteria requires autonomous task execution
4. **Clean break point** - Refactoring already stripped old code, perfect time to rebuild properly

**Without this work:**
- Autopilot remains manual (no autonomous task pickup)
- Can't add more agents (no coordination layer)
- Can't measure progress (no lifecycle telemetry)
- Old monolithic architecture persists (technical debt compounds)

**With this work:**
- Autonomous task execution enabled
- Multi-agent coordination possible
- Lifecycle observability established
- Clean architecture foundation laid

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Monolithic autopilot architecture → clean separation (supervisor/agent/infrastructure)
- Manual task assignment → autonomous selection
- Implicit coordination → explicit lease management
- Guesswork about progress → observable lifecycle

**What are we ADDING?**
- Supervisor scaffold (~500 LOC)
- Agent scaffold (~500 LOC)
- Lifecycle telemetry (~200 LOC)
- Integration test (~100 LOC)

**Is the addition justified?**
- **Yes:** Enables autonomy (can't orchestrate without orchestrator)
- **Yes:** Replaces manual work (autopilot becomes autonomous)
- **Yes:** Observable (can track what's happening)
- **Yes:** Scalable (supports multiple agents)

### COHERENCE (Match Terrain)

**Reusing proven patterns:**
- Supervisor/worker pattern (distributed systems)
- Lease management (Google Bigtable, Chubby)
- Lifecycle events (Kubernetes pod lifecycle)
- Strangler fig pattern (Martin Fowler refactoring)

### LOCALITY (Related near)

**Related work together:**
- Supervisor code in `tools/wvo_mcp/src/supervisor/`
- Agent code in `tools/wvo_mcp/src/agents/`
- Integration test with both supervisor + agent
- All scaffolding in W0.M1 (foundation milestone)

### VISIBILITY (Important obvious)

**Critical structure explicit:**
- Supervisor scaffold makes orchestration obvious
- Agent scaffold makes execution units obvious
- Lifecycle events make progress obvious
- Lease management makes coordination obvious

### EVOLUTION (Fitness)

**This work enables evolution:**
- Supervisor can add new agent types (extensible)
- Agents can evolve capabilities (pluggable)
- Lifecycle can add new events (observable)
- Integration can add new patterns (testable)

---

## Alternatives Considered

### Alternative 1: Keep Monolithic Autopilot
**Approach:** Continue with single-file autopilot, no orchestration layer

**Rejected because:**
- Doesn't scale (can't add multiple agents)
- Hard to test (no separation of concerns)
- Poor observability (no lifecycle events)
- Technical debt accumulates

### Alternative 2: Use External Orchestrator (Temporal, Airflow)
**Approach:** Integrate with existing workflow engine

**Rejected because:**
- Heavy dependency (another system to manage)
- Overkill for current needs (5-10 agents, not 1000s)
- Loss of control (can't customize lifecycle)
- Integration complexity high

### Alternative 3: Minimal Supervisor (No Agents)
**Approach:** Just build supervisor, inline task execution

**Rejected because:**
- Doesn't enable multi-agent coordination
- Still monolithic (supervisor + execution coupled)
- Can't specialize agents (all tasks same pattern)

### Selected: Lightweight Supervisor + Agent Scaffold

**Why:**
- **Right-sized** - Solves current problem without over-engineering
- **Extensible** - Can add agents/capabilities incrementally
- **Observable** - Lifecycle events provide visibility
- **Clean architecture** - Clear separation of concerns

---

## Success Criteria

**Set complete when:**

### Supervisor Functional
- [ ] Supervisor reads roadmap.yaml and selects next task
- [ ] Lease acquired before task starts
- [ ] Lifecycle events emitted (selected, assigned, started, completed)
- [ ] Evidence captured in state/evidence/<TASK>/

### Agent Functional
- [ ] Agent receives task assignment
- [ ] Agent executes work process (STRATEGIZE → MONITOR)
- [ ] Agent reports status to supervisor
- [ ] Agent generates evidence bundle

### Integration Validated
- [ ] TEST-SUPERVISOR-INTEGRATION-001 passes
- [ ] All 4 lifecycle events present in telemetry
- [ ] Lease acquired and released properly
- [ ] Evidence bundle complete

### Clean-Room Integrated
- [ ] New autopilot scaffold merged
- [ ] Old autopilot code removed
- [ ] No regression in existing functionality
- [ ] Migration documented in evidence

---

## Risks and Mitigations

### Risk 1: Supervisor/Agent Interface Unclear
- **Threat:** Unclear contract between supervisor and agents causes integration failures
- **Mitigation:** Define explicit interface (lease, task assignment, status reporting)
- **Mitigation:** Integration test validates contract (TEST-SUPERVISOR-INTEGRATION-001)

### Risk 2: Lifecycle Events Missing/Wrong
- **Threat:** Telemetry doesn't capture all events, can't track progress
- **Mitigation:** Test validates all 4 events present
- **Mitigation:** Schema validation for lifecycle events
- **Mitigation:** Fail loudly if event missing

### Risk 3: Lease Management Race Conditions
- **Threat:** Multiple agents pick same task, duplicate work
- **Mitigation:** Atomic lease acquisition
- **Mitigation:** Test with concurrent agents
- **Mitigation:** Use existing SQLite for state (ACID guarantees)

### Risk 4: Integration Breaks Existing Autopilot
- **Threat:** New scaffold incompatible with existing infrastructure
- **Mitigation:** Strangler pattern (incremental replacement)
- **Mitigation:** Keep both old/new running during migration
- **Mitigation:** Rollback path documented

---

## Estimated Effort

**Supervisor scaffold:** 8 hours (lease management, task selection, telemetry)
**Agent scaffold:** 8 hours (task execution, status reporting, evidence)
**Integration test:** 4 hours (TEST-SUPERVISOR-INTEGRATION-001 implementation)
**Clean-room merge:** 4 hours (strangler pattern, old code removal)

**Total:** ~24 hours

**Deliverables:**
- 4 tasks completed (tasks 2, 3, 5, 8 from W0.M1)
- Supervisor scaffold operational
- Agent scaffold operational
- Integration validated
- Clean-room autopilot merged

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md (define acceptance criteria precisely)
**Owner:** Claude Council
**Tasks in set:** AFP-W0-M1-MVP-SUPERVISOR-SCAFFOLD, TEST-SUPERVISOR-INTEGRATION-001, AFP-W0-M1-MVP-AGENTS-SCAFFOLD, AFP-W0-M1-AUTOPILOT-MVP-STRANGLER
