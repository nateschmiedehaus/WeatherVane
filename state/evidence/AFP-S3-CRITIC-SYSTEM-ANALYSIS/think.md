# THINK: Edge Cases, Risks, and Failure Modes

**Task ID:** AFP-S3-CRITIC-SYSTEM-ANALYSIS
**Date:** 2025-11-05
**Phase:** THINK (Phase 4 of 10)

---

## Note on Fundamental Alternatives

**See alternatives.md** for deep analysis of whether critics should exist at all.

This document (think.md) assumes we proceed with refactoring critics and analyzes the risks/edge cases of that approach.

---

## Edge Cases for Recommended Approach

### EC1: Partial Migration State

**Scenario:** We've migrated 3/5 observation critics to new base class, but 2 remain on old pattern.

**Problem:**
- Two patterns coexist (confusing)
- Tests must cover both
- Documentation unclear

**Mitigation:**
- Migrate all 5 in one atomic PR (day 2-3)
- Feature flag: `USE_NEW_OBSERVATION_BASE`
- If migration fails, rollback ALL 5

**Probability:** MEDIUM (migration takes 6-8 hours, interruptions likely)

---

### EC2: Breaking Change in Base Class

**Scenario:** We extract EscalationManager from base.ts, but 46 critics depend on base class API.

**Problem:**
```typescript
// OLD API (works):
class MyCritic extends Critic {
  // this.handleEscalation() available
}

// NEW API (breaks):
class MyCritic extends Critic {
  // this.escalationMgr.handleEscalation() required
  // But if escalationMgr is undefined? NPE!
}
```

**Mitigation:**
- Make dependencies optional with defaults:
```typescript
class Critic {
  constructor(
    workspace: string,
    private escalationMgr = new EscalationManager(), // Default!
  ) {}
}
```
- Backward compatibility shim:
```typescript
protected async handleEscalation(result: CriticResult) {
  return this.escalationMgr.handleEscalation(result);
}
```

**Probability:** HIGH (46 critics = 46 potential breakage points)

---

### EC3: Test Flakiness in Observation Critics

**Scenario:** API observation tests spawn dev server on `localhost:3000`, but port already in use.

**Problem:**
```typescript
// Test 1 starts server on :3000
await startDevServer(); // Success

// Test 2 tries same port
await startDevServer(); // Error: EADDRINUSE
```

**Mitigation:**
- Random ports: `const port = 3000 + Math.floor(Math.random() * 1000)`
- Cleanup: `afterEach(async () => await killAllServers())`
- Retry logic: If port busy, try next port
- Timeout: Kill servers after 30s regardless

**Probability:** HIGH (observation critics spawn processes)

---

### EC4: Adaptive Thresholds Regress

**Scenario:** Document reviewers have adaptive thresholds based on agent track record. After refactor, this logic breaks.

**Problem:**
```typescript
// OLD: Track record embedded in each critic
class DesignReviewerCritic {
  private async loadTrackRecord() { /* complex logic */ }
  private applyAdaptive() { /* intertwined with review */ }
}

// NEW: Extracted to base class
class DocumentReviewerCritic {
  // If extraction is wrong, track record lost
}
```

**Mitigation:**
- Test adaptive logic separately BEFORE migration
- Create `track_record.test.ts` with known scenarios:
  - Agent with 100% approval rate → easier threshold
  - Agent with 50% approval rate → normal threshold
  - New agent → strictest threshold
- Verify same behavior after refactor

**Probability:** MEDIUM (complex logic, easy to break)

---

### EC5: Escalation Config Files Out of Sync

**Scenario:** We change escalation schema but old config files remain.

**Problem:**
```json
// OLD: state/escalation/design_reviewer.json
{
  "severity_threshold": "critical",
  "cooldown_hours": 24
}

// NEW: Schema changed
{
  "severity_threshold": "critical",
  "cooldown_hours": 24,
  "required_field": "..." // Missing in old files!
}
```

**Mitigation:**
- Schema validation on load:
```typescript
const config = await loadEscalationConfig(path);
if (!validateSchema(config)) {
  throw new Error(`Invalid schema: ${path}`);
}
```
- Migration script:
```bash
node scripts/migrate_escalation_configs.js
# Adds missing fields, updates schema
```
- Fail fast: Don't silently use invalid config

**Probability:** LOW (only 3 escalation configs exist)

---

## Failure Modes

### FM1: Refactor Introduces Bugs, Users Blocked

**Failure:** After refactoring observation critics, APIObservationCritic fails on all tasks.

**Impact:**
- Users cannot complete tasks (GATE blocked)
- Rollback required
- Trust in system damaged

**Detection:**
- Run full test suite before merge: `npm test`
- Run critics on known-good tasks: `npm run critics:smoke-test`
- Canary deployment: Enable new critics for 10% of tasks first

**Recovery:**
```bash
# Immediate rollback
git revert <refactor-commit>
git push

# Fix forward
git revert <revert-commit>
# Apply fix
git commit -m "fix: observation critic bug"
```

**Prevention:**
- Comprehensive tests (70% coverage target)
- Smoke tests on real tasks
- Gradual rollout (10% → 50% → 100%)

**Probability:** MEDIUM (large refactor, 46 critics)

---

### FM2: Build Breaks on Dependency Update

**Failure:** After deleting `intelligence_engine.ts`, something else imports it.

**Impact:**
- Build fails: `error TS2307: Cannot find module`
- CI blocked
- Development halted

**Detection:**
```bash
# BEFORE deletion, find all imports
grep -r "from.*intelligence_engine" src/
grep -r "import.*intelligence_engine" src/

# Should return 0 results before deleting
```

**Recovery:**
```bash
# Option A: Restore file
git checkout HEAD -- src/critics/intelligence_engine.ts

# Option B: Fix imports
# Remove import from offending files
```

**Prevention:**
- TypeScript compiler catches this (if we run `npm run build`)
- Always build before committing
- CI fails on build errors

**Probability:** LOW (TypeScript catches this)

---

### FM3: Tests Pass Locally, Fail in CI

**Failure:** Observation critic tests spawn processes that work locally but timeout in CI.

**Cause:**
- CI has limited resources (CPU, memory)
- CI may not allow process spawning
- CI may have different port availability

**Detection:**
```yaml
# .github/workflows/test.yml
- run: npm test
  timeout-minutes: 10 # If tests hang, fail fast
```

**Recovery:**
- Mock process spawning in tests:
```typescript
jest.mock('../utils/process', () => ({
  spawn: jest.fn().mockResolvedValue({ pid: 1234 })
}));
```
- Or: Skip observation tests in CI
```typescript
const runObservationTests = process.env.CI !== 'true';

(runObservationTests ? describe : describe.skip)('Observation Critics', () => {
  // ...
});
```

**Probability:** MEDIUM (CI environments vary)

---

### FM4: Plugin System Never Gets Built

**Failure:** We refactor critics but don't add plugin system (still hardcoded registry).

**Impact:**
- Users still must edit `session.ts` to add critics
- Extensibility goal not achieved
- Refactor doesn't solve core problem

**Detection:**
- Acceptance criteria in SPEC: "Plugin system working"
- Test: Can add critic without editing core files?

**Recovery:**
- Acknowledge: Refactor improved structure, plugin system is future work
- Or: Delay merge until plugin system complete

**Probability:** LOW (plugin system is in plan)

---

### FM5: Agentic Pilot is Too Expensive

**Failure:** We convert DesignReviewerCritic to agentic (LLM-based), costs skyrocket.

**Cost analysis:**
```
Current (regex-based):
  - Cost: $0 (no API calls)
  - Latency: 100ms (fast)

Agentic (LLM-based):
  - Cost: $0.01 per review × 100 tasks/day = $1/day = $365/year
  - Latency: 2-5s (slower)
  - Plus: API rate limits, quota management
```

**Mitigation:**
- Cache LLM responses (same design.md → same review)
- Use cheaper model (GPT-3.5 vs GPT-4)
- Set budget: Max $10/day, then fall back to regex
- Measure ROI: Does agentic catch 10× more issues?

**Probability:** MEDIUM (LLM costs add up)

---

## Risks by Approach

### Risks: Option 1 (Delete Critics, Use Standard Tools)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Lose unique functionality (observation, AFP checks) | HIGH | HIGH | Keep complex critics, delete simple ones |
| Cannot integrate with orchestrator | HIGH | MEDIUM | Keep integration layer thin |
| Users miss intelligent escalation | MEDIUM | MEDIUM | Manual GitHub Issues workflow |

**Overall risk:** MEDIUM-HIGH (loses significant value)

---

### Risks: Option 2 (Restore Agentic Vision)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM costs too high | MEDIUM | HIGH | Budget caps, caching |
| Latency unacceptable (5s vs 100ms) | MEDIUM | MEDIUM | Async reviews, don't block |
| Complexity explosion (+5,000 LOC) | HIGH | HIGH | Pilot one critic first |
| LLM hallucinations (false positives/negatives) | MEDIUM | HIGH | Human oversight, confidence thresholds |

**Overall risk:** HIGH (ambitious, untested)

---

### Risks: Option 3 (Policy-as-Code)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Too simplistic (loses intelligence) | MEDIUM | MEDIUM | Hybrid: policies + some code |
| Cannot express complex rules in YAML | MEDIUM | LOW | Allow plugins for complex checks |
| Users don't understand policy language | LOW | LOW | Good documentation |

**Overall risk:** LOW (simplest, most pragmatic)

---

### Risks: Option 6 (Incremental Refactor)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Refactor introduces bugs | MEDIUM | HIGH | Comprehensive tests first |
| Takes longer than 5-7 days | MEDIUM | LOW | Aggressive but realistic timeline |
| Doesn't solve fundamental issues | LOW | MEDIUM | Refactor improves structure significantly |
| Halfway state is worse | LOW | HIGH | Atomic migrations per critic family |

**Overall risk:** LOW-MEDIUM (safest, most incremental)

---

## Stress Testing: What If...?

### Stress 1: 1000 Critics

**Scenario:** System grows to 1000 critics (not 46).

**Current design:** Would collapse
- Hardcoded registry can't scale
- Session.ts would import 1000 classes
- Test suite would take hours

**Refactored design:** Still struggles
- Need plugin system (not in current plan)
- Need lazy loading
- Need critic categorization/discovery

**Lesson:** If we expect >100 critics, need plugin architecture NOW.

---

### Stress 2: Critics Run in Parallel

**Scenario:** Run all 46 critics concurrently (not sequentially).

**Problem:**
- Observation critics spawn dev servers (port conflicts)
- File I/O contention (reading same files)
- Memory explosion (46 × processes)

**Solution:**
- Resource pooling: Max 5 dev servers at once
- Queuing: Critics wait for resources
- Isolation: Docker containers per critic

**Lesson:** Current design assumes sequential execution.

---

### Stress 3: Malicious Critic

**Scenario:** Someone adds a critic that deletes files or exfiltrates data.

**Current:** No protection
```typescript
class EvilCritic extends Critic {
  protected command() {
    return "rm -rf / --no-preserve-root"; // OOPS
  }
}
```

**Mitigation:**
- Sandboxing: Run critics in isolated environments
- Capability-based security: Critics declare permissions
- Code review: All critics reviewed before merge
- Static analysis: Detect dangerous commands

**Lesson:** Security not considered in current design.

---

### Stress 4: Critic Takes 1 Hour

**Scenario:** ObservationCritic runs comprehensive load test, takes 1 hour.

**Problem:**
- User waits 1 hour to complete task
- Blocks other tasks (if sequential)
- Timeout issues

**Solution:**
- Async critics: Run in background, notify when done
- Timeout limits: Kill after 10 minutes
- Progressive enhancement: Quick check first, deep check optional

**Lesson:** Need timeout and async patterns.

---

## Decision Trees

### Decision: Migrate Observation Critics?

```
Q: Are observation critics providing value?
├─ YES: Do they find real bugs?
│  ├─ YES: Keep and refactor (extract base class)
│  └─ NO: Reconsider - maybe delete
└─ NO: Delete and use monitoring tools (Datadog, etc.)

Q: Is 1,300 LOC savings worth migration risk?
├─ YES: Proceed with migration (day 2-3)
└─ NO: Leave as-is, focus on other critics
```

### Decision: Add Plugin System?

```
Q: Will users add custom critics?
├─ YES: Plugin system essential
│  Q: How many custom critics expected?
│  ├─ 1-5: Simple registry API sufficient
│  ├─ 5-20: Need discovery mechanism
│  └─ 20+: Need marketplace, versioning
└─ NO: Hardcoded registry acceptable
```

### Decision: Go Agentic?

```
Q: Is original vision (agentic critics) still valid?
├─ YES: Restore agentic capability
│  Q: All critics or pilot?
│  ├─ ALL: 2-4 weeks, high risk
│  └─ PILOT: 1 week, low risk, learn first
└─ NO: Keep current approach (refactor only)
```

---

## Mitigation Summary

| Risk Category | Mitigation Strategy | Priority |
|---------------|---------------------|----------|
| Breaking changes | Backward compat shims, gradual rollout | HIGH |
| Test flakiness | Random ports, cleanup, retries | HIGH |
| Build failures | TypeScript checks, CI gates | HIGH |
| Cost explosion | Budget caps, caching, cheaper models | MEDIUM |
| Security | Sandboxing, code review | MEDIUM |
| Performance | Timeouts, async, resource limits | MEDIUM |
| Complexity | Pilot before full rollout | HIGH |

---

## Recommended Risk Posture

**For Option 6 (Incremental Refactor):**
- **Accept:** Some test flakiness (can fix as we go)
- **Mitigate:** Breaking changes (backward compat shims)
- **Avoid:** Big bang migration (atomic per-family migrations)
- **Transfer:** None (we own this risk)

**For Option 2 (Agentic):**
- **Pilot first:** 1 critic, measure cost/latency/quality
- **Budget cap:** $10/day max LLM spend
- **Fallback:** If pilot fails, revert to regex
- **Learn:** Gather data before full rollout

---

## Conclusion

**Edge cases:** 5 identified, all mitigatable
**Failure modes:** 5 identified, detection/recovery plans exist
**Risks:** Vary by option (LOW for refactor, HIGH for agentic)
**Stress tests:** Reveal need for: plugins, sandboxing, async, timeouts

**Overall assessment:** Incremental refactor (Option 6) is LOWEST RISK, acceptable return.

**Next phase:** GATE (design.md) - Five Forces analysis and final implementation plan
