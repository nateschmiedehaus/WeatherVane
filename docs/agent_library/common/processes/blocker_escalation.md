# Blocker Escalation

Step-by-step process for escalating blockers with SLA enforcement.

---

## SLA Timeline

```
0 min    ──→   10 min   ──→   30 min   ──→   2 hours
  ↓               ↓               ↓               ↓
Start         Log Blocker    Escalate to     Critical
Work            in Context    Orchestrator    Escalation
```

---

## Timeline Breakdown

### T+0: Start Work

**Action**: Begin task execution

```typescript
logInfo('Starting task', { task_id: 'T1.2.3', agent: 'worker_1' });

// Read requirements
// Set up environment
// Begin implementation
```

**No action required yet** - work normally

---

### T+10: Log Blocker

**Trigger**: Stuck for 10 minutes, cannot proceed

**Action**: Document blocker in context

```typescript
await context_write({
  section: "Blockers",
  content: `
## T1.2.3 - Blocker (10 min)

**Problem**: Cannot connect to weather API
**Status**: Investigating
**Impact**: Task blocked, cannot proceed

**Attempts**:
1. Checked API key in .env - present ✓
2. Tested with curl - works ✓
3. Checked network - other APIs work ✓
4. Still getting timeout from Node.js ✗

**Next**: Will try adding request headers
`,
  append: true
});
```

**Purpose**: Creates record, alerts team to potential issue

**Continue working**: Still trying to resolve

---

### T+30: Escalate to Orchestrator

**Trigger**: Stuck for 30 minutes, still cannot proceed

**Action 1 - Update task status**:
```typescript
await plan_update({
  task_id: 'T1.2.3',
  status: 'blocked'
});
```

**Action 2 - Document full escalation**:
```typescript
await context_write({
  section: "Escalations",
  content: `
🚨 ESCALATION - T1.2.3 (30 min blocked)

**Task**: T1.2.3 - Weather API integration
**Blocker**: API timeout from Node.js (curl works)

**Full attempts log**:
1. Verified API key in .env ✓
2. Tested with curl (200ms response) ✓
3. Checked network (other APIs work) ✓
4. Added request headers (User-Agent, Accept) ✗
5. Increased timeout to 60s ✗
6. Tried different HTTP libraries (axios, fetch, got) ✗

**Hypothesis**: Node.js requests may be missing required headers or config

**Impact**:
- Task T1.2.3 blocked
- Task T1.2.4 (depends on T1.2.3) cannot start
- Epic E1 timeline at risk

**Request**: Need help diagnosing why Node.js requests timeout but curl works

**Escalating to**: @Atlas
`,
  append: true
});
```

**Purpose**: Get expert help before wasting more time

---

### T+2h: Critical Escalation

**Trigger**: Blocked for 2 hours, no resolution

**Action 1 - Mark as high priority**:
```typescript
await context_write({
  section: "Critical Blockers",
  content: `
🚨🚨 CRITICAL BLOCKER - T1.2.3 (2 hours)

**Task**: T1.2.3 - Weather API integration
**Duration**: 2 hours blocked
**Severity**: HIGH - blocks critical path

**Escalating to**:
- @Atlas (technical lead)
- @DirectorDana (operations)
- Relevant specialist if identified

**Recommended actions**:
1. Immediate investigation by senior engineer
2. Consider alternative approach (curl wrapper, different API)
3. Timeline impact assessment for M1
`,
  append: true
});
```

**Action 2 - Alert all stakeholders**:
- Atlas (required)
- Director Dana (required)
- Domain specialist if known

**Purpose**: Prevent extended blockage affecting milestone

---

## Blocker Types & Responses

### 1. Technical Blocker

**Example**: Cannot implement feature, stuck on approach

**Response**:
- T+10: Log blocker, keep trying
- T+30: Escalate to Atlas (architectural guidance)
- T+2h: Critical escalation (consider alternative approach)

**Template**:
```markdown
## Technical Blocker

**What**: Cannot figure out how to implement caching with proper invalidation
**Tried**:
- TTL-based cache (but data can change before TTL expires)
- Event-based invalidation (but no events from API)
- Polling for changes (but too expensive)

**Need**: Architectural guidance on caching strategy
```

---

### 2. External Dependency

**Example**: Waiting for API key, credentials, access

**Response**:
- T+0: Request resource (email, Slack, ticket)
- T+10: Log blocker
- T+30: Escalate to Atlas (for task reassignment or urgency bump)
- T+2h: Critical escalation to Director Dana (may need executive intervention)

**Template**:
```markdown
## External Dependency Blocker

**What**: Waiting for weather API credentials from vendor
**Requested**: 2025-10-20 (3 days ago)
**Follow-ups**:
- Email sent 2025-10-22
- Slack message 2025-10-23

**Impact**: Cannot proceed with T1.2.3, T1.2.4, T1.2.5 (all blocked)

**Recommendation**: Assign different task while waiting, or escalate to procurement
```

---

### 3. Unclear Requirement

**Example**: Specification ambiguous, need clarification

**Response**:
- T+10: Document specific questions, escalate to Atlas
- T+30: If no response, mark blocked
- T+2h: Critical escalation (may need stakeholder input)

**Template**:
```markdown
## Unclear Requirement Blocker

**What**: Task says "optimize performance" but no target specified

**Questions**:
1. What's the current performance baseline?
2. What's the target performance?
3. What's the acceptable resource usage?
4. Which operations should be optimized (all or specific)?

**Need**: Clarification from @Atlas or product owner
```

---

### 4. Infrastructure Issue

**Example**: Build system down, database unavailable

**Response**:
- T+0: Immediately escalate to Director Dana (no 30-min wait)
- Check if affecting other agents
- Attempt workaround if possible

**Template**:
```markdown
🚨 INFRASTRUCTURE ISSUE

**What**: PostgreSQL database not responding
**Impact**: All agents blocked (cannot read/write tasks)
**Status**: Attempted restart - failed

**Escalating immediately to**: @DirectorDana
```

---

## Blocker Resolution

### When Blocker Resolved

**Action 1 - Update status**:
```typescript
await plan_update({
  task_id: 'T1.2.3',
  status: 'in_progress'
});
```

**Action 2 - Log resolution**:
```typescript
await context_write({
  section: "Blockers",
  content: `
✅ RESOLVED - T1.2.3

**Blocker**: API timeout from Node.js
**Resolution**: Added required User-Agent header (Open-Meteo requires this)

**Fix**:
\`\`\`typescript
headers: {
  'User-Agent': 'WeatherVane/1.0'
}
\`\`\`

**Lesson**: Always check API docs for required headers, even if they seem optional.

**Thanks**: @Atlas for suggesting header debugging
`,
  append: true
});
```

**Action 3 - Resume work**:
```typescript
// Continue where you left off
// Complete verification loop
// Mark task done
```

---

## Blocker Metrics

### Mean Time to Resolve (MTTR)

**Formula**: Average time from blocker detected to resolved

**Target**: <2 hours

**Track by blocker type** to identify patterns

### Blocker Rate

**Formula**: `(blocked_tasks / total_tasks) * 100`

**Target**: <10%

**High blocker rate** indicates process problems

### Escalation Response Time

**Formula**: Time from escalation to first response

**Target**: <30 minutes

**Track to ensure SLA compliance**

---

## Escalation Best Practices

### 1. Be Specific

❌ **Bad**: "API doesn't work"
✅ **Good**: "API times out after 5s when called from Node.js, but curl works in 200ms"

### 2. Show Your Work

❌ **Bad**: "Tried a few things"
✅ **Good**: "Tried: 1) increased timeout, 2) different libraries, 3) added headers - all failed"

### 3. Assess Impact

❌ **Bad**: "Task is blocked"
✅ **Good**: "Task T1.2.3 blocked, which blocks T1.2.4 and T1.2.5, affecting M1 timeline"

### 4. Propose Solutions

❌ **Bad**: "Don't know what to do"
✅ **Good**: "Options: A) debug deeper, B) use curl wrapper, C) try different API"

---

## De-Escalation

**After resolution**:

1. ✅ Update task status
2. ✅ Document resolution
3. ✅ Log learnings
4. ✅ Thank responders
5. ✅ Update roadmap if timeline changed

---

## References

- [Escalation Protocol](/docs/agent_library/common/concepts/escalation_protocol.md)
- [Task Lifecycle](/docs/agent_library/common/processes/task_lifecycle.md)
- [Communication Standards](/docs/agent_library/common/standards/communication_standards.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
