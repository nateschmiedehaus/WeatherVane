# Escalation Protocol

When to escalate, how to escalate, and who to escalate to.

---

## Core Principle

**Escalate early, not late.** Stuck for 30 minutes? Escalate. Better to ask for help early than waste hours going in circles.

---

## When to Escalate

### Time-Based Escalation

**10 minutes**: Log blocker in context
```typescript
context_write({
  section: "Blockers",
  content: "Task T1.2.3: Cannot connect to API (investigating)",
  append: true
})
```

**30 minutes**: Escalate to orchestrator
```typescript
plan_update({ task_id: "T1.2.3", status: "blocked" })
// Alert Atlas via context
```

**2 hours**: Critical escalation
```
Escalate to Director Dana + relevant specialist
Tag as critical blocker in context
```

### Complexity-Based Escalation

**Worker autonomy**: Complexity ≤6
- If complexity >6 → escalate to Atlas

**Worker encounters architectural decision**:
- Escalate to Atlas (even if complexity ≤6)

**Worker encounters security concern**:
- Escalate to Security Sentinel critic + Director Dana

---

## Escalation Paths

### 1. Technical Blockers

**Examples**:
- Cannot figure out how to implement feature
- Third-party API not working
- Build/test failures after 3+ attempts
- Performance issue unclear how to fix

**Escalate to**:
- **Atlas** (complexity/architectural issues)
- **Director Dana** (infrastructure/tooling issues)
- **Relevant specialist critic** (domain-specific issues)

**Template**:
```markdown
## Blocker: [Brief description]

**Task**: T1.2.3 - [Task title]
**Status**: Blocked for [duration]

**Problem**:
[Clear description of what's blocking you]

**What I tried**:
1. [Attempt 1] ✓ or ✗
2. [Attempt 2] ✓ or ✗
3. [Attempt 3] ✓ or ✗

**Impact**:
- Blocks task T1.2.3
- May delay milestone M1
- Affects [other tasks/epics]

**Request**:
[Specific help needed]

**Escalating to**: [Atlas/Dana/other]
```

---

### 2. Complexity Escalation

**When**: Task complexity exceeds your autonomy level

**Worker** (max complexity 6):
```yaml
task:
  id: T1.3.1
  complexity: 8  # Too complex for worker!
```

**Action**:
```markdown
## Complexity Escalation

**Task**: T1.3.1 - Implement distributed caching
**Complexity**: 8/10 (exceeds worker max of 6)

**Reason for escalation**:
This task requires architectural decisions:
- Which caching technology (Redis vs Memcached)?
- Distributed vs local caching?
- Cache invalidation strategy?

**Recommendation**:
Assign to Atlas or break into smaller tasks

**Escalating to**: Atlas
```

---

### 3. Security Escalation

**When**: Any security concern

**Examples**:
- Potential vulnerability
- Secret exposed in code
- Authentication/authorization unclear
- Compliance concern

**Action**: Immediate escalation (no 30-minute wait)

**Template**:
```markdown
🚨 SECURITY ESCALATION

**Task**: T1.2.3
**Concern**: [Security issue]

**Details**:
[What you found]

**Potential Impact**:
[What could go wrong]

**Immediate Action Taken**:
- [ ] Stopped work on related tasks
- [ ] Did NOT commit the code
- [ ] Alerted team

**Escalating to**: Security Sentinel critic + Director Dana + Atlas
```

---

### 4. Infinite Loop Escalation

**When**: Verification loop iterations >5 OR regression cycle detected

**Signs of regression loop**:
- Fixing A breaks B
- Fixing B breaks A
- Same error appears 3+ times

**Action**:
```markdown
## Infinite Loop Escalation

**Task**: T1.2.3
**Iterations**: 6 (exceeded limit of 5)

**Cycle Pattern**:
1. Fixed TypeScript error in file A → broke tests in file B
2. Fixed tests in file B → TypeScript error in file A returns
3. Fixed both → npm audit fails
4. Fixed audit → TypeScript error in file A returns
5. Same cycle repeating
6. Still stuck

**Root Cause Hypothesis**:
Files A and B have circular dependency

**Proposed Fix**:
Refactor to remove circular dependency (requires architectural guidance)

**Escalating to**: Atlas
```

See [Verification Loop: Escalation Protocol](/docs/agent_library/common/concepts/verification_loop.md#escalation-protocol-infinite-loops)

---

### 5. Dependency Blocker

**When**: Task depends on something you can't control

**Examples**:
- Waiting for API credentials
- Waiting for design mockups
- Waiting for stakeholder decision
- Waiting for another task to complete

**Action**:
```markdown
## Dependency Blocker

**Task**: T1.3.1 - Integrate payment API
**Status**: Blocked (external dependency)

**Blocker**:
Waiting for payment API credentials from vendor

**What I've done**:
- [ ] Contacted vendor (2025-10-20)
- [ ] Followed up via email (2025-10-22)
- [ ] Escalated to procurement team (2025-10-23)

**Impact**:
- T1.3.1 cannot proceed
- T1.3.2, T1.3.3 also blocked (depend on T1.3.1)
- Epic E1 timeline at risk

**Recommendation**:
- Reassign to different task in meantime
- Create follow-up task for when credentials arrive

**Escalating to**: Atlas (for task reassignment)
```

---

## Escalation Matrix

| Issue Type | Blocker Duration | Escalate To | Priority |
|-----------|------------------|-------------|----------|
| **Technical blocker** | 30 min | Atlas | Medium |
| **Complexity >6** | Immediate | Atlas | Medium |
| **Security concern** | Immediate | Security + Dana + Atlas | Critical |
| **Infrastructure issue** | 30 min | Director Dana | Medium |
| **Infinite loop (>5 iterations)** | Immediate | Atlas | High |
| **External dependency** | 2 hours | Atlas | Medium |
| **Critical production bug** | Immediate | All hands | Critical |
| **Policy question** | 1 hour | Atlas → Human | Medium |

---

## Who to Escalate To

### Atlas (Strategic Orchestrator)

**When**:
- Complexity >6
- Architectural decisions
- Stuck >30 minutes on technical problem
- Breaking API changes needed
- Major refactoring required

**How**:
```typescript
context_write({
  section: "Escalations",
  content: "🚨 @Atlas - [brief description]. See details in Blockers section.",
  append: true
})
```

---

### Director Dana (Infrastructure)

**When**:
- Infrastructure failures (CI/CD, build system)
- Tooling issues
- Critic execution problems
- System health degradation
- Resource allocation needs

**How**:
```typescript
context_write({
  section: "Escalations",
  content: "🚨 @DirectorDana - Infrastructure issue. [details]",
  append: true
})
```

---

### Specialist Critics

**When**: Domain-specific guidance needed

**Examples**:
- **security**: Security concerns
- **academic_rigor**: ML methodology questions
- **design_system**: UX/design decisions
- **cost_perf**: Performance optimization
- **data_quality**: Data validation issues

**How**:
```markdown
## Critic Consultation Request

**Task**: T1.2.3
**Critic**: academic_rigor
**Question**: [Specific question]

**Context**: [Background]

**Request**: [What guidance do you need]
```

---

### Human Stakeholders

**When**: (Atlas escalates, not workers)
- Policy decisions
- Budget approvals
- Legal/compliance questions
- Product direction changes
- Scope changes

**How**: Atlas coordinates

---

## Escalation Best Practices

### 1. Provide Context

**Good escalation**:
```markdown
## Blocker: API timeout issues

**Task**: T1.2.3 - Weather data integration
**Blocked for**: 45 minutes

**Problem**:
Open-Meteo API timing out after 5 seconds. Tried increasing timeout
to 10s, 30s, 60s - no difference. API docs say average response is <1s.

**What I tried**:
1. Increased timeout to 60s - still times out ✗
2. Tested with curl - works fine (200ms response) ✓
3. Checked network - other APIs work ✓
4. Reviewed code - same pattern as working examples ✓
5. Added detailed logging - request never gets response ✗

**Hypothesis**:
Request headers might be malformed or missing required fields.

**Request**:
Need help diagnosing why requests from Node.js time out but curl works.

**Escalating to**: Atlas
```

**Bad escalation**:
```markdown
API doesn't work. Help!
```

### 2. Show Your Work

**Always include**:
- What you tried
- Results of each attempt
- Current hypothesis
- Specific help needed

### 3. Assess Impact

**Include**:
- Which tasks are blocked
- Timeline impact
- Workarounds attempted
- Urgency level

### 4. Propose Solutions

**If you have ideas**:
```markdown
**Possible Solutions**:
A. Switch to different weather API (1 day work)
B. Debug HTTP request in depth (unknown time)
C. Use curl wrapper as temporary workaround (2 hours)

**Recommendation**: Option C (unblocks immediately), then option B
```

---

## De-Escalation

**When blocker is resolved**:

1. **Update task status**:
   ```typescript
   plan_update({ task_id: "T1.2.3", status: "in_progress" })
   ```

2. **Log resolution**:
   ```typescript
   context_write({
     section: "Blockers",
     content: "✅ RESOLVED - T1.2.3: API timeout fixed by adding required User-Agent header",
     append: true
   })
   ```

3. **Document learnings**:
   ```markdown
   **Resolution**: Open-Meteo API requires User-Agent header. Without it,
   requests silently time out after 5s.

   **Fix**: Added header:
   headers: { 'User-Agent': 'WeatherVane/1.0' }

   **Lesson**: Always check API docs for required headers, even if they
   seem optional.
   ```

4. **Thank escalation responder**:
   ```markdown
   Thanks @Atlas for the suggestion to check headers. That was the issue!
   ```

---

## Escalation Metrics

**Track**:
- Escalation rate (escalations per 100 tasks)
- Time to resolution (from escalation to resolution)
- Escalation reasons (categorized)
- Repeat escalations (same issue multiple times)

**Targets**:
- Escalation rate: <10%
- Time to resolution: <2 hours
- Repeat escalations: <5%

**Use**:
- Identify training needs
- Improve documentation
- Adjust autonomy bounds
- Optimize workflows

---

## Common Escalation Mistakes

### ❌ Escalating Too Late

**Problem**: Waste hours stuck before asking for help

**Fix**: 30-minute rule (if stuck, escalate)

### ❌ Escalating Without Context

**Problem**: Responder doesn't have info to help

**Fix**: Use escalation template (problem, attempts, request)

### ❌ Escalating Everything

**Problem**: Erodes trust, creates noise

**Fix**: Only escalate when truly stuck (not just "not sure")

### ❌ Not Following Up

**Problem**: Blocker resolved but not documented

**Fix**: Always close the loop (document resolution)

---

## Example Escalations

### Example 1: Technical Blocker

```markdown
## Blocker: Memory leak in data processing

**Task**: T1.2.5 - Process weather data at scale
**Blocked for**: 40 minutes

**Problem**:
Memory usage grows unbounded when processing >1000 records.
Process crashes after ~5000 records with "JavaScript heap out of memory".

**What I tried**:
1. Increased heap size to 4GB - delayed crash but still crashes ✗
2. Added manual GC calls - no improvement ✗
3. Profiled with Chrome DevTools - shows large Map growing ✓
4. Reviewed code - Map is cleared after each batch ✓
5. Logged Map size - confirms it's being cleared ✓

**Hypothesis**:
Map might have memory leak in V8, or objects have circular references
preventing GC.

**Impact**:
- Cannot process production-scale data
- Blocks T1.2.6, T1.2.7 (depend on this)
- Milestone M1 at risk if not resolved soon

**Request**:
Need help identifying memory leak source. Happy to pair program or
share profiler output.

**Escalating to**: Atlas
```

### Example 2: Complexity Escalation

```markdown
## Complexity Escalation

**Task**: T2.1.1 - Design multi-tenant data architecture
**Complexity**: 9/10 (exceeds worker max of 6)

**Reason**:
This task requires architectural decisions with long-term implications:

1. **Isolation model**: Row-level vs schema-level vs database-level?
2. **Scaling strategy**: Horizontal (shard by tenant) vs vertical?
3. **Cross-tenant queries**: How to handle analytics across tenants?
4. **Migration path**: How to migrate existing single-tenant data?

**Analysis**:
I can implement any chosen architecture, but the decision itself
requires strategic context I don't have:
- Expected tenant count (10s? 1000s? 10000s?)
- Query patterns (mostly single-tenant or frequent cross-tenant?)
- Compliance requirements (data residency, isolation guarantees?)

**Recommendation**:
Atlas makes architectural decision, then I can implement.

**Escalating to**: Atlas
```

---

## References

- [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md)
- [Blocker Escalation Process](/docs/agent_library/common/processes/blocker_escalation.md)
- [Communication Standards](/docs/agent_library/common/standards/communication_standards.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
