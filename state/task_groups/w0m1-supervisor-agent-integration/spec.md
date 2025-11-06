# SPEC: w0m1-supervisor-agent-integration

**Set ID:** w0m1-supervisor-agent-integration
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Supervisor Scaffold Operational

**Given:** Roadmap with pending tasks
**When:** Supervisor starts
**Then:**
- Supervisor reads state/roadmap.yaml
- Selects next task using plan_next logic
- Acquires lease in state/supervisor_leases.jsonl
- Emits "selected" lifecycle event to state/analytics/supervisor_lifecycle.jsonl
- Assigns task to agent
- Emits "assigned" lifecycle event

**Test:**
```bash
# Start supervisor
cd tools/wvo_mcp && npm run wave0 &

# Wait for supervisor to pick task
sleep 5

# Verify lifecycle events
cat ../../state/analytics/supervisor_lifecycle.jsonl | jq 'select(.event=="selected")'
cat ../../state/analytics/supervisor_lifecycle.jsonl | jq 'select(.event=="assigned")'

# Verify lease acquired
cat ../../state/supervisor_leases.jsonl | jq 'select(.status=="active")'
```

**Success:** All 3 checks return results (selected event, assigned event, active lease)

---

### AC2: Agent Scaffold Operational

**Given:** Task assigned by supervisor
**When:** Agent executes task
**Then:**
- Agent receives assignment via interface
- Emits "started" lifecycle event
- Executes work process (STRATEGIZE → MONITOR phases)
- Creates evidence bundle in state/evidence/<TASK>/
- Emits "completed" lifecycle event
- Reports status to supervisor
- Releases lease

**Test:**
```bash
# Agent should have completed TEST-SUPERVISOR-INTEGRATION-001
# Check lifecycle events
cat state/analytics/supervisor_lifecycle.jsonl | \
  jq 'select(.task_id=="TEST-SUPERVISOR-INTEGRATION-001")'

# Should show all 4 events: selected, assigned, started, completed
```

**Success:** All 4 lifecycle events present for test task

---

### AC3: Lifecycle Telemetry Complete

**Given:** Task execution from start to finish
**When:** Reviewing telemetry
**Then:**
- 4 lifecycle events present: selected, assigned, started, completed
- Events in correct order (temporal sequence)
- All events have required fields (task_id, timestamp, agent_id)
- Events written to state/analytics/supervisor_lifecycle.jsonl

**Test:**
```bash
# Validate lifecycle event schema
node -e "
const events = require('fs')
  .readFileSync('state/analytics/supervisor_lifecycle.jsonl', 'utf8')
  .trim().split('\n')
  .map(JSON.parse)
  .filter(e => e.task_id === 'TEST-SUPERVISOR-INTEGRATION-001');

const required = ['selected', 'assigned', 'started', 'completed'];
const found = events.map(e => e.event);

console.log('Required:', required);
console.log('Found:', found);
console.log('Valid:', required.every(r => found.includes(r)));
"
```

**Success:** Output shows "Valid: true"

---

### AC4: Lease Management Functional

**Given:** Multiple agents competing for tasks
**When:** Task selected
**Then:**
- Only one agent acquires lease (atomic)
- Lease has expiry (TTL)
- Expired leases can be reclaimed
- Active leases prevent duplicate work

**Test:**
```bash
# Check lease structure
cat state/supervisor_leases.jsonl | jq '.'

# Verify required fields
# {
#   "task_id": "...",
#   "agent_id": "...",
#   "status": "active" | "released" | "expired",
#   "acquired_at": "ISO timestamp",
#   "expires_at": "ISO timestamp"
# }
```

**Success:** Lease has all required fields and correct status

---

### AC5: Integration Test Passes

**Given:** TEST-SUPERVISOR-INTEGRATION-001 task in roadmap
**When:** Wave 0 autopilot runs
**Then:**
- Supervisor picks up test task
- Agent executes test task
- All lifecycle events emitted
- Lease acquired and released
- Test task marked "done" in roadmap

**Test:**
```bash
# Run Wave 0
cd tools/wvo_mcp && npm run wave0

# Wait for test to complete (or check logs)
tail -f ../../state/analytics/wave0_startup.log

# Verify test task completed
grep "TEST-SUPERVISOR-INTEGRATION-001" ../../state/roadmap.yaml | grep "status: done"
```

**Success:** Test task status = done, all lifecycle events present

---

### AC6: Evidence Bundle Generated

**Given:** Agent completes task
**When:** Reviewing evidence
**Then:**
- Evidence directory exists: state/evidence/<TASK>/
- Contains lifecycle artifacts (selected, assigned, started, completed timestamps)
- Contains agent work artifacts (strategy/spec/plan/implement as applicable)
- Contains completion summary

**Test:**
```bash
# Check evidence for test task
ls state/evidence/TEST-SUPERVISOR-INTEGRATION-001/

# Should contain:
# - lifecycle.json (all 4 events)
# - summary.md (completion notes)
```

**Success:** Evidence directory exists with required files

---

### AC7: Clean-Room Autopilot Integrated

**Given:** New autopilot scaffold complete
**When:** Running autopilot
**Then:**
- Uses new supervisor/agent architecture
- Old monolithic autopilot code removed
- No regression in existing functionality (can still run tasks)
- Migration documented

**Test:**
```bash
# Check new architecture in use
grep -r "class Supervisor" tools/wvo_mcp/src/supervisor/
grep -r "class Agent" tools/wvo_mcp/src/agents/

# Verify old code removed
! grep -r "old_autopilot" tools/wvo_mcp/src/

# Run smoke test
cd tools/wvo_mcp && npm run wave0 && cd ../..
```

**Success:** New architecture present, old code gone, wave0 runs

---

## Functional Requirements

### FR1: Supervisor Must Select Tasks Autonomously
- No manual intervention required
- Uses plan_next logic for prioritization
- Respects dependencies
- Respects task status (pending only)

### FR2: Supervisor Must Manage Leases
- Atomic lease acquisition (no race conditions)
- Lease expiry (TTL = 4 hours default)
- Lease release on completion
- Lease reclaim on expiry

### FR3: Supervisor Must Emit Lifecycle Events
- "selected" when task chosen
- "assigned" when agent receives task
- "started" when agent begins work
- "completed" when agent finishes

### FR4: Agent Must Execute Work Process
- Receive task assignment
- Execute phases (STRATEGIZE → MONITOR)
- Generate evidence bundle
- Report status to supervisor

### FR5: Agent Must Be Pluggable
- Interface-based (not hardcoded)
- Multiple agent types supported (researcher, implementer, reviewer)
- Agent capabilities advertised
- Supervisor matches tasks to capable agents

### FR6: Integration Must Be Observable
- All events logged to jsonl files
- Structured logging (JSON, not plaintext)
- Queryable with jq
- Timestamps in ISO 8601 format

---

## Non-Functional Requirements

### NFR1: Reliability
- Supervisor restarts from last checkpoint (crash recovery)
- Agent failures don't crash supervisor
- Lease expiry prevents stuck tasks
- Retry logic for transient failures

### NFR2: Performance
- Task selection <1 second
- Lease acquisition <100ms
- Lifecycle event write <10ms
- Evidence bundle write <1 second

### NFR3: Maintainability
- Clear separation: supervisor/agent/infrastructure
- Interface-driven design
- Unit tests for core logic
- Integration tests for end-to-end

### NFR4: Observability
- All events logged
- Metrics exported (task count, duration, success rate)
- Alerts on failures
- Dashboards (future: W5.M1)

---

## Exit Criteria

**Set complete when ALL criteria met:**

- [x] AC1: Supervisor scaffold operational (task selection, lease, events)
- [x] AC2: Agent scaffold operational (receives task, executes, reports)
- [x] AC3: Lifecycle telemetry complete (4 events, correct schema)
- [x] AC4: Lease management functional (atomic, TTL, status)
- [x] AC5: Integration test passes (TEST-SUPERVISOR-INTEGRATION-001)
- [x] AC6: Evidence bundle generated (lifecycle.json, summary.md)
- [x] AC7: Clean-room autopilot integrated (new arch, old code removed)

**Quality gates:**
- [ ] Unit tests pass (supervisor, agent, lease logic)
- [ ] Integration test passes (end-to-end)
- [ ] Code review complete (peer review)
- [ ] Documentation complete (README, architecture diagram)

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md (execution approach)
**Owner:** Claude Council
