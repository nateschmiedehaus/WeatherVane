# THINK: Critics Systemic Performance Remediation

**Task**: CRIT-PERF-GLOBAL-9dfa06.1 - Research and design for [Critics] Systemic performance remediation
**Date**: 2025-10-28
**Phase**: THINK

---

## Edge Cases Analysis

### Edge Case 1: Long-Running Observations

**Scenario**: Performance profiling or chaos testing takes >5 minutes
**Impact**: Blocks autopilot progress, timeout risks
**Detection**: Check `duration_ms` field in critic results

**Mitigations**:
1. **Time Budget Per Domain** (SPEC line 366)
   - API: <2 minutes (quick traces)
   - Database: <1 minute (query analysis)
   - Performance: <5 minutes (profiling + flamegraph)
   - Data: <3 minutes (statistical tests)
   - Infrastructure: <10 minutes (chaos tests)

2. **Async Execution** (Out of scope for Phase 1)
   - Queue long-running observations
   - Run in background worker
   - Poll for results

3. **Progressive Timeouts**
   - Quick mode: 60s max
   - Standard mode: 5m max
   - Deep mode: 10m max

4. **Capability Profile Integration**
   - "low" profile: Skip heavy observations
   - "standard": Run quick observations only
   - "high": Run full observations

**Decision**: Enforce time budgets (SPEC line 270-275), add timeouts to observer config

---

### Edge Case 2: Artifact Disk Bloat

**Scenario**: Flamegraphs (50MB), screenshots (10MB each), traces (5MB) accumulate
**Impact**: Disk space exhaustion after 100+ critic runs
**Detection**: Monitor `tmp/critic-observations/` size

**Mitigations**:
1. **Automatic Cleanup** (SPEC line 81-83)
   - Delete artifacts >7 days old
   - Cron job or startup hook
   - Retention policy configurable

2. **Size Limits Per Artifact Type**
   ```yaml
   artifact_limits:
     flamegraph_max_mb: 50
     screenshot_max_mb: 10
     trace_max_mb: 5
     total_session_max_mb: 100
   ```

3. **Compression**
   - gzip flamegraphs (50MB → 5MB typical)
   - PNG optimization for screenshots
   - JSON minification for traces

4. **Artifact Sampling**
   - Store 1 in 10 observations permanently
   - Keep only recent 10 sessions in full

5. **Cloud Storage Migration** (Out of scope)
   - Move old artifacts to S3
   - Keep local only recent

**Decision**: Implement 7-day cleanup + 100MB session limit (SPEC line 279-284)

**Real Example** (from prior art):
- Playwright screenshots: 800KB per full-page capture × 30 pages × 3 viewports = ~72MB per session
- With 7-day retention: ~500MB max for screenshot critic alone

---

### Edge Case 3: Domain Expertise Gaps

**Scenario**: Implementing data leakage detection requires statistics knowledge
**Impact**: Initial observations may be shallow or incorrect
**Detection**: Review quality during REVIEW phase

**Mitigations**:
1. **Copy-Paste from Existing Scripts** (PLAN line 69-75)
   - Forecast stitch monitoring (apps/worker/monitoring/forecast_stitch.py)
   - Existing profiling scripts (if any)
   - Open-source monitoring tools

2. **Simple Heuristics First**
   - Data: Check for >0.95 correlation (leakage)
   - Performance: Check for >80% CPU (hot path)
   - API: Check for >500ms p95 (latency)

3. **Iterate Based on Production Use**
   - Start with basic checks
   - Add sophisticated checks after seeing real issues

4. **External Tool Integration**
   - Lighthouse for UX scoring
   - EXPLAIN ANALYZE for database queries
   - Node --prof for CPU profiling

5. **Documentation References** (PLAN line 101-105)
   - Link to best practices docs
   - Example configurations
   - Common patterns library

**Decision**: Phase-based sophistication (PLAN Phase 2: basic, Phase 3: advanced)

**Risk**: Early observations may miss issues. Mitigation: Iterate after production feedback.

---

### Edge Case 4: Flaky Observations

**Scenario**: Network latency varies, timing-sensitive assertions fail intermittently
**Impact**: False negatives (miss real issues) or false positives (noise)
**Detection**: Same critic passes then fails on identical code

**Mitigations**:
1. **Retry Logic**
   ```typescript
   const MAX_RETRIES = 3;
   for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
     const result = await runObservation();
     if (result.passed) return result;
   }
   return result; // All failed
   ```

2. **Statistical Thresholds**
   - Don't fail on single p95 spike
   - Require 3 consecutive violations
   - Use moving averages for trends

3. **Environment Detection**
   - CI: More lenient thresholds (network varies)
   - Local: Stricter thresholds (controlled)

4. **Exclude Known Flaky Metrics**
   - Network latency (external APIs)
   - Cold-start timing
   - External service availability

5. **Graceful Degradation**
   ```typescript
   if (observationFailed && reason === 'timeout') {
     return { passed: true, warning: 'Observation timed out, skipped' };
   }
   ```

**Decision**: No retries in Phase 1 (keep simple), add in Phase 2 if needed

---

### Edge Case 5: Missing Observable Artifacts

**Scenario**: Dev server not running for API observation, no test data for data observation
**Impact**: Observation fails with error, no feedback
**Detection**: Observation error messages

**Mitigations**:
1. **Pre-Flight Checks**
   ```typescript
   async preflight(): Promise<PreflightResult> {
     if (this.domain === 'api') {
       const serverUp = await checkServerHealth();
       if (!serverUp) return { canRun: false, reason: 'Server not running' };
     }
     return { canRun: true };
   }
   ```

2. **Auto-Start Services** (Out of scope)
   - Start dev server if not running
   - Requires complex process management

3. **Skip with Clear Message**
   ```json
   {
     "passed": null,
     "skipped": true,
     "reason": "API server not reachable at http://localhost:3000"
   }
   ```

4. **Fallback Modes**
   - API: Check static OpenAPI spec if server down
   - Data: Use sample data if real data missing

5. **Dependency Declaration** (PLAN line 192-203)
   ```yaml
   dependencies:
     - service: api_server
       check: "curl http://localhost:3000/health"
     - file: data/train.parquet
       required: true
   ```

**Decision**: Pre-flight checks (PLAN Phase 1, line 41-49) + skip with message

---

### Edge Case 6: Configuration Errors

**Scenario**: Typo in YAML config, invalid threshold values
**Impact**: Observation fails with cryptic error
**Detection**: YAML validation errors

**Mitigations**:
1. **Schema Validation** (SPEC line 61)
   - JSON Schema or Zod validation
   - Fail fast on invalid config
   - Clear error messages

   ```typescript
   const ConfigSchema = z.object({
     endpoints: z.array(z.object({
       url: z.string().url(),
       method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
       load_test: z.object({
         concurrent: z.number().min(1).max(1000),
         duration_ms: z.number().min(1000)
       }).optional()
     })),
     thresholds: z.object({
       max_latency_p95_ms: z.number().positive(),
       max_error_rate: z.number().min(0).max(1)
     })
   });
   ```

2. **Default Values**
   - Sensible defaults for optional fields
   - Merge user config with defaults

3. **Config Linting** (Out of scope)
   - Lint YAML files on commit
   - Pre-commit hook

4. **Example Configs** (SPEC line 312, PLAN line 101)
   - Ship with working examples
   - Copy-paste ready

5. **Config Testing**
   - Unit test config loading
   - Test with invalid configs

**Decision**: JSON Schema validation (SPEC line 61), ship example configs (PLAN line 101-105)

---

### Edge Case 7: Version Mismatches

**Scenario**: Observation expects Node 20, but system has Node 18
**Impact**: Observations fail due to missing APIs
**Detection**: Runtime errors about missing features

**Mitigations**:
1. **Version Detection**
   ```typescript
   const nodeVersion = process.versions.node;
   if (semver.lt(nodeVersion, '18.0.0')) {
     throw new Error('Node 18+ required');
   }
   ```

2. **Compatibility Matrix** (Out of scope)
   - Document required versions
   - Check in preflight

3. **Graceful Degradation**
   - Use fallback APIs if available
   - Skip unsupported features

4. **Container Isolation** (Out of scope)
   - Run observations in Docker
   - Guaranteed environment

**Decision**: Document requirements (PLAN Phase 1, line 49), version checks deferred to Phase 2

---

### Edge Case 8: Race Conditions (Multiple Critics)

**Scenario**: Two critics try to write to same artifact directory simultaneously
**Impact**: File corruption, incomplete data
**Detection**: Mangled JSON, missing files

**Mitigations**:
1. **Session Isolation** (SPEC line 78-79)
   ```
   tmp/critic-observations/[critic-name]/[session-id]/
   ```
   - Each run gets unique session ID
   - No shared directories

2. **File Locking** (Out of scope)
   - Use `fs.promises` atomic writes
   - Lock files during writes

3. **Atomic Operations**
   ```typescript
   await fs.writeFile(path, data, { flag: 'wx' }); // Fail if exists
   ```

4. **Sequential Execution**
   - Run critics one at a time
   - Use queue if parallel needed

**Decision**: Session-based isolation (SPEC line 78-79) prevents races

---

## Alternative Approaches

### Alternative 1: Individual Scripts (Forecast Stitch Pattern)

**Description**: Implement separate monitoring script for each critic

**Pros**:
- ✅ High quality, domain-specific insights
- ✅ Proven pattern (forecast_stitch works)
- ✅ No framework complexity
- ✅ Easy to understand per-script

**Cons**:
- ❌ Time-intensive (~2-3 hours per critic × 33 critics = 66-99 hours)
- ❌ No code reuse (artifact management, config, reporting)
- ❌ Inconsistent reporting formats
- ❌ Harder to maintain (33 separate scripts)
- ❌ Not suitable for research task (requires implementation)

**Verdict**: **REJECTED** - Too time-intensive, lacks consistency

**When to Reconsider**: For critics with highly specialized needs not fitting framework

---

### Alternative 2: Generic Framework (Recommended)

**Description**: TypeScript framework + domain-specific plugins (hybrid approach)

**Pros**:
- ✅ Scalable to 33 critics
- ✅ Consistent reporting format
- ✅ Shared artifact management
- ✅ Easier to maintain
- ✅ Framework reuse (config loading, cleanup, timeouts)
- ✅ Suitable for design phase

**Cons**:
- ⚠️ Upfront framework design needed (~16-20 hours)
- ⚠️ May lack domain-specific depth initially
- ⚠️ Risk of over-engineering

**Verdict**: **ACCEPTED** - Best balance of scalability and maintainability

**Implementation Path**: PLAN Phase 1 (framework) → Phases 2-5 (domain observers)

---

### Alternative 3: Minimal Viable Implementation

**Description**: Return placeholder commands that output minimal JSON

**Pros**:
- ✅ Fast (~1 hour)
- ✅ Unblocks critics immediately
- ✅ Demonstrates pattern

**Cons**:
- ❌ No real observations (just stubs)
- ❌ No actionable feedback
- ❌ Still requires follow-up work
- ❌ Wasted effort (throwaway code)

**Verdict**: **REJECTED** - Provides no real value

**When to Reconsider**: Never (partial solutions create debt)

---

### Alternative 4: External Tool Integration

**Description**: Wrap existing monitoring tools (Lighthouse, New Relic, DataDog)

**Pros**:
- ✅ Leverage mature tools
- ✅ Less code to write
- ✅ Industry-standard metrics

**Cons**:
- ❌ External dependencies (licensing, installation)
- ❌ Not all domains have good tools (data leakage)
- ❌ Tool integration complexity (APIs, auth)
- ❌ Cost (some tools require licenses)

**Verdict**: **PARTIAL ACCEPTANCE** - Use where applicable

**Hybrid Approach** (PLAN line 69-75):
- Performance: Use Node --prof (built-in)
- UX: Use Lighthouse (open source)
- Database: Use EXPLAIN ANALYZE (native SQL)
- Data: Custom (no good tools)
- API: Custom (specific to our API)

---

### Alternative 5: Runtime vs Static Analysis

**Description**: Return to static analysis instead of runtime observation

**Pros**:
- ✅ Faster (no runtime overhead)
- ✅ Deterministic (no flakiness)
- ✅ Simpler (just parse code)

**Cons**:
- ❌ Misses runtime issues (leaks, actual latency, real errors)
- ❌ False positives (code looks bad but works)
- ❌ False negatives (code looks good but has runtime issues)
- ❌ Contradicts runtime observation paradigm (docs/critics/RUNTIME_OBSERVATION_PATTERN.md)

**Verdict**: **REJECTED** - Runtime observation is the paradigm

**Quote from docs**: "Static analysis tells you what the code says. Runtime observation tells you what the system actually does."

---

## Architecture Trade-Offs

### Trade-Off 1: TypeScript vs Python for Observers

**Option A: TypeScript** (Recommended)
- ✅ Same language as critic framework
- ✅ Better type safety
- ✅ Easier integration (no subprocess spawn)
- ❌ Less ecosystem for data/ML tools

**Option B: Python**
- ✅ Better ecosystem (numpy, pandas, matplotlib)
- ✅ Easier statistical analysis
- ❌ Subprocess overhead
- ❌ Language boundary (JSON serialization)

**Decision**: TypeScript framework + Python plugins where needed (STRATEGIZE line 196-199)

**Hybrid Pattern** (PLAN line 53-62):
```typescript
class DataObserver extends BaseObserver {
  async captureArtifacts() {
    // Spawn Python script for heavy stats
    const result = await spawnSync('python', ['scripts/analyze_drift.py', dataPath]);
    return JSON.parse(result.stdout);
  }
}
```

---

### Trade-Off 2: YAML vs JSON vs Code for Configuration

**Option A: YAML** (Recommended - STRATEGIZE line 210-213)
- ✅ Human-readable
- ✅ Follows existing pattern (screenshot_config.yaml)
- ✅ Comments supported
- ❌ Parsing overhead
- ❌ Type safety requires validation

**Option B: JSON**
- ✅ Native JavaScript support
- ✅ Faster parsing
- ❌ No comments
- ❌ Less human-readable (quotes, commas)

**Option C: TypeScript Config Objects**
- ✅ Full type safety
- ✅ Code reuse (functions)
- ❌ Requires compilation
- ❌ Harder for non-engineers to edit

**Decision**: YAML (SPEC line 59-66) with JSON Schema validation

---

### Trade-Off 3: Artifact Storage Location

**Option A: tmp/critic-observations/** (Recommended - STRATEGIZE line 226-230)
- ✅ Consistent with tmp/screenshots/
- ✅ Clearly temporary
- ✅ Easy to clean up
- ❌ Not gitignored by default (need .gitignore entry)

**Option B: state/critics/observations/**
- ✅ Near critic state files
- ✅ Already gitignored (state/)
- ❌ Clutters state/ directory
- ❌ Inconsistent with existing artifact pattern

**Option C: .critic-cache/**
- ✅ Hidden by default
- ❌ Not discoverable
- ❌ New pattern (learning curve)

**Decision**: tmp/critic-observations/ (SPEC line 79-85)

**Directory Structure**:
```
tmp/critic-observations/
  api_observation/
    2025-10-28-14-30-00/
      artifacts/
        endpoint_traces.json
        latency_histogram.png
      report.json
      raw/
        request_logs.txt
  performance_observation/
    2025-10-28-14-35-00/
      artifacts/
        flamegraph.svg
        heap_snapshot.heapsnapshot
      report.json
```

---

### Trade-Off 4: Synchronous vs Asynchronous Execution

**Option A: Synchronous** (Recommended for Phase 1)
- ✅ Simpler implementation
- ✅ Easier debugging (linear flow)
- ✅ No concurrency issues
- ❌ Slower (critics run sequentially)

**Option B: Asynchronous**
- ✅ Faster (parallel execution)
- ✅ Better resource utilization
- ❌ Complex (race conditions, resource contention)
- ❌ Harder debugging (interleaved logs)

**Decision**: Synchronous (Phase 1), async optimization in Phase 2 if needed

**Rationale**: Observation time budgets (2-10 minutes) are acceptable. Complexity not worth it for Phase 1.

---

### Trade-Off 5: Fail-Fast vs Graceful Degradation

**Option A: Fail-Fast**
- ✅ Clear signal (something is wrong)
- ✅ Forces fixing issues
- ❌ Blocks progress (critic fails → task blocks)

**Option B: Graceful Degradation** (Recommended)
- ✅ Non-blocking (skip failed observations)
- ✅ Partial feedback better than none
- ❌ May hide real issues

**Decision**: Graceful degradation with warnings (STRATEGIZE line 55, SPEC line 77)

**Pattern**:
```typescript
try {
  const result = await runObservation();
  return result;
} catch (error) {
  logger.warn('Observation failed, skipping', { error });
  return {
    passed: null,
    skipped: true,
    reason: error.message
  };
}
```

**Rationale**: Observations are enhancement, not blocker. Better to skip than to block task.

---

## Failure Modes & Recovery

### Failure Mode 1: Network Timeout

**Symptoms**: API observation hangs, no response
**Root Cause**: External API unreachable
**Impact**: Observation fails after timeout

**Recovery**:
1. Detect: Observation timeout (SPEC line 156: 60s)
2. Log: "API observation timed out after 60s"
3. Return: `{ passed: null, skipped: true, reason: 'timeout' }`
4. Retry: No automatic retry (graceful skip)

**Prevention**: Short timeouts (60s max), clear error messages

---

### Failure Mode 2: Disk Space Exhausted

**Symptoms**: Artifact write fails with ENOSPC
**Root Cause**: tmp/ directory full
**Impact**: Observation artifacts not saved

**Recovery**:
1. Detect: ENOSPC error during artifact write
2. Emergency cleanup: Delete oldest sessions
3. Retry: Attempt write again
4. Fallback: Return report without artifacts

**Prevention**:
- 7-day cleanup (SPEC line 81)
- 100MB session limit (SPEC line 279)
- Pre-flight disk space check

---

### Failure Mode 3: Invalid Configuration

**Symptoms**: TypeError reading config, validation errors
**Root Cause**: Typo in YAML, schema mismatch
**Impact**: Observation fails on load

**Recovery**:
1. Detect: Schema validation error
2. Log: Clear error message with line number
3. Return: `{ passed: false, error: 'Invalid config: endpoints[0].url is not a valid URL' }`
4. Fallback: Use default config (if available)

**Prevention**:
- Schema validation (SPEC line 61)
- Config tests (PLAN Phase 1, line 49)
- Example configs (PLAN line 101-105)

---

### Failure Mode 4: Missing Dependencies

**Symptoms**: Command not found (e.g., python, node)
**Root Cause**: Tool not installed
**Impact**: Observation fails immediately

**Recovery**:
1. Detect: Spawn error (ENOENT)
2. Log: "Python not found, install: brew install python3"
3. Return: `{ passed: null, skipped: true, reason: 'python not installed' }`

**Prevention**:
- Document dependencies (PLAN Phase 1, line 49)
- Pre-flight checks (Edge Case 5)

---

### Failure Mode 5: Malformed Artifacts

**Symptoms**: Invalid JSON, corrupt images
**Root Cause**: Observation crashed mid-write
**Impact**: Report parsing fails

**Recovery**:
1. Detect: JSON.parse error
2. Log: "Artifact corrupted, ignoring"
3. Return: Report with `artifacts: []`
4. Cleanup: Delete partial artifacts

**Prevention**:
- Atomic writes (write to .tmp, rename)
- Validate artifacts after write

---

### Failure Mode 6: Observation Crash

**Symptoms**: Observer process exits unexpectedly
**Root Cause**: Segfault, unhandled exception
**Impact**: No report returned

**Recovery**:
1. Detect: Exit code ≠ 0
2. Log: "Observer crashed with exit code 139"
3. Return: `{ passed: false, error: 'Observer crashed' }`
4. Capture: stderr for debugging

**Prevention**:
- Try-catch all observer code
- Process isolation (spawn observer in child process)

---

## Risk Assessment

### Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|-----------|--------|----------|------------|
| Framework too complex | Medium | High | **HIGH** | Start minimal (Phase 1), iterate |
| Domain expertise gaps | High | Medium | **MEDIUM** | Copy existing patterns, iterate |
| Observation performance overhead | Medium | Medium | **MEDIUM** | Time budgets, capability profiles |
| Artifact disk bloat | High | Low | **LOW** | 7-day cleanup, 100MB limits |
| Flaky observations | Medium | Medium | **MEDIUM** | Statistical thresholds, retries (Phase 2) |
| Version mismatches | Low | Medium | **LOW** | Document requirements, version checks |
| Configuration errors | Medium | Low | **LOW** | Schema validation, examples |

---

### Risk 1: Framework Too Complex (SPEC line 353-356)

**Description**: BaseObserver has too many abstract methods, hard to implement observers

**Likelihood**: Medium
**Impact**: High (delays adoption, 33 critics stuck)

**Indicators**:
- First observer takes >4 hours to implement
- Observers have >500 lines of boilerplate
- Developers ask "how do I implement this?"

**Mitigations**:
1. **Minimal Interface** (PLAN line 15-21)
   ```typescript
   abstract captureArtifacts(): Promise<Artifacts>;
   abstract analyzeArtifacts(artifacts: Artifacts): Promise<Issues>;
   // formatReport() and calculateScore() are provided by base class
   ```
   Only 2 required methods.

2. **Concrete Example** (PLAN line 23-62)
   - Implement APIObserver as reference
   - Copy-paste template for new observers

3. **Iterate Based on Feedback** (SPEC line 356)
   - Get feedback after first 2 implementations
   - Simplify if needed

**Decision**: Accept risk, mitigate with minimal interface + example

---

### Risk 2: Domain Expertise Gaps (SPEC line 357-361)

**Description**: Implementing quality observations requires ML, stats, or performance expertise

**Likelihood**: High
**Impact**: Medium (initial observations shallow, improve over time)

**Indicators**:
- Data observer misses known leakage
- Performance observer identifies irrelevant hot paths
- Database observer suggests wrong indexes

**Mitigations**:
1. **Start Simple** (Edge Case 3)
   - Basic heuristics (>0.95 correlation, >80% CPU)
   - Improve based on production feedback

2. **External Tool Integration** (Alternative 4)
   - Lighthouse for UX (industry standard)
   - EXPLAIN ANALYZE for DB (built-in)

3. **Reference Implementations** (PLAN line 69-75)
   - Copy from forecast_stitch
   - Search for existing scripts

4. **Iterate** (SPEC line 361)
   - Deploy with basic checks
   - Add sophisticated checks after seeing real issues

**Decision**: Accept risk, prioritize simple checks first

---

### Risk 3: Performance Overhead (SPEC line 362-366)

**Description**: Observations take too long, block autopilot progress

**Likelihood**: Medium
**Impact**: Medium (slower iteration, developer friction)

**Indicators**:
- Observations take >10 minutes
- Task completion slows by >2x
- Developers bypass critics with SKIP flag

**Mitigations**:
1. **Time Budgets** (SPEC line 270-275)
   - API: <2 minutes
   - Database: <1 minute
   - Performance: <5 minutes

2. **Capability Profile Integration** (Edge Case 1)
   - "low": Skip observations
   - "standard": Quick checks only
   - "high": Full observations

3. **Async Execution** (Out of scope Phase 1)
   - Queue heavy observations
   - Continue with other work

4. **Performance Optimization** (Phase 2+)
   - Cache results where possible
   - Incremental analysis (only changed code)

**Decision**: Accept risk, enforce time budgets

---

### Risk 4: Artifact Disk Bloat (SPEC line 367-371)

**Description**: Artifacts fill up disk space (flamegraphs, screenshots, traces)

**Likelihood**: High
**Impact**: Low (disk space cheap, cleanup easy)

**Indicators**:
- tmp/critic-observations/ >10GB
- Disk usage alerts
- CI runs fail with "no space left"

**Mitigations**:
1. **Automatic Cleanup** (SPEC line 81-83)
   - Delete artifacts >7 days old
   - Cron job daily

2. **Size Limits** (SPEC line 279-284)
   - 100MB per session
   - Reject artifacts exceeding limit

3. **Compression** (Edge Case 2)
   - gzip flamegraphs (50MB → 5MB)
   - PNG optimization

4. **Monitoring**
   - Log artifact sizes
   - Alert if >5GB

**Decision**: Accept risk, implement cleanup + limits

---

## Implementation Sequence Rationale

### Why Phase 1 First? (Foundation)

**Rationale**: All other phases depend on framework foundation

**Dependencies**:
- Phase 2 (API, Perf, DB) needs BaseObserver
- Phase 3 (Data, Modeling) needs artifact management
- Phase 4 (UX, Product) needs reporting format
- Phase 5 (Infra, Meta) needs config loading

**Blockers if skipped**:
- No consistent reporting (chaos)
- Duplicate artifact management (each observer reimplements)
- No config validation (runtime errors)

**Time Investment**: 16-20 hours upfront saves 50+ hours downstream

---

### Why Prioritize API/Perf/DB? (Phase 2)

**Rationale**: Highest impact, most mature tools, easiest to implement

**Impact Analysis**:
- API issues block all users (high severity)
- Performance issues visible to all (high visibility)
- Database issues compound (N+1 queries)

**Tool Maturity**:
- API: curl, simple traces (mature)
- Performance: Node --prof (built-in)
- Database: EXPLAIN ANALYZE (native)

**Ease of Implementation**:
- Clear observable artifacts (traces, profiles, plans)
- Existing patterns (forecast_stitch)
- No domain expertise required (engineering basics)

---

### Why Defer ML/Data? (Phase 3)

**Rationale**: Requires domain expertise, less urgent

**Complexity**:
- Statistical tests (KL divergence, residual analysis)
- Leakage detection (correlation, time-based features)
- Distribution drift (requires baseline)

**Priority**:
- Data issues affect model quality (important but not urgent)
- Detected in ML evaluation phase (not runtime critical)

**Dependency**:
- Needs working ML pipeline to observe
- May not exist yet in WeatherVane

---

### Why Last: Infra/Meta? (Phase 5)

**Rationale**: Lowest frequency, highest complexity, least mature

**Frequency**:
- Chaos tests run weekly (not per-commit)
- Infra changes rare (deploys, not features)

**Complexity**:
- Chaos testing requires production-like environment
- Recovery testing needs multiple services
- Meta-critique requires understanding all critics

**Maturity**:
- No established patterns (pioneering)
- External tools immature (Chaos Monkey, Gremlin)

---

## Open Questions & Deferred Decisions

### Question 1: Real-Time vs Batch Observations?

**Real-Time**: Observer runs on every critic invocation
- ✅ Immediate feedback
- ❌ Slower (blocks task)

**Batch**: Observer runs nightly, aggregates results
- ✅ Faster (no blocking)
- ❌ Delayed feedback (issues discovered next day)

**Deferred**: Implement real-time (simpler), add batch option in Phase 2 if needed

---

### Question 2: Local vs Remote Artifact Storage?

**Local**: tmp/critic-observations/
- ✅ Simple (no network)
- ❌ Disk space limits

**Remote**: S3, GCS, etc.
- ✅ Unlimited space
- ❌ Network dependency, auth complexity

**Deferred**: Start local (Phase 1), add remote option in Phase 2+ if disk becomes issue

---

### Question 3: Observation Result Caching?

**Cache Results**: If code unchanged, return cached observation
- ✅ Faster (skip observation)
- ❌ Miss issues from environment changes

**Always Run**: Observe every time
- ✅ Catch all issues
- ❌ Slower

**Deferred**: No caching in Phase 1 (simpler), add in Phase 2 if performance is issue

---

### Question 4: Multi-Agent Coordination?

**Problem**: Two agents run same critic simultaneously
**Risk**: Race conditions, duplicate work

**Options**:
- A) Locks (Redis, file locks)
- B) Session isolation (tmp/[session-id]/)
- C) Sequential execution (queue)

**Decision**: Session isolation (SPEC line 78-79) prevents most issues. Locks deferred to Phase 2 if multi-agent deployment needed.

---

### Question 5: Integration with Quality Gate Orchestrator?

**Current**: Critics run independently
**Future**: Quality gate orchestrator runs critics + enforces thresholds

**Integration Points**:
- QGO calls critics via `command()`
- QGO aggregates observation reports
- QGO decides pass/fail based on thresholds

**Deferred**: Phase 1 focuses on critic-level observations. QGO integration in Phase 2.

---

## Decision Log

### Decision 1: Generic Framework (Hybrid)
**Date**: 2025-10-28
**Rationale**: Scalability + consistency outweigh upfront cost (STRATEGIZE line 102-119)
**Alternatives Rejected**: Individual scripts (too time-intensive), minimal stubs (no value)

### Decision 2: YAML Configuration
**Date**: 2025-10-28
**Rationale**: Human-readable, follows existing pattern (screenshot_config.yaml)
**Trade-Off**: Parsing overhead vs readability (readability wins)

### Decision 3: Graceful Degradation
**Date**: 2025-10-28
**Rationale**: Skip failed observations, don't block progress
**Trade-Off**: May hide issues vs blocking progress (non-blocking wins)

### Decision 4: Time Budgets
**Date**: 2025-10-28
**Rationale**: Prevent runaway observations, enforce performance discipline
**Values**: API 2m, DB 1m, Perf 5m, Data 3m, Infra 10m (SPEC line 270-275)

### Decision 5: 7-Day Artifact Retention
**Date**: 2025-10-28
**Rationale**: Balance disk space vs historical data
**Trade-Off**: Lose old artifacts vs disk bloat (7 days sufficient for debugging)

### Decision 6: Session-Based Isolation
**Date**: 2025-10-28
**Rationale**: Prevent race conditions without locks
**Pattern**: tmp/critic-observations/[critic]/[session-id]/ (SPEC line 78-79)

### Decision 7: Synchronous Execution (Phase 1)
**Date**: 2025-10-28
**Rationale**: Simplicity over speed, async in Phase 2 if needed
**Trade-Off**: Sequential (slower) vs parallel (complex) - simple wins for Phase 1

### Decision 8: TypeScript Framework + Python Plugins
**Date**: 2025-10-28
**Rationale**: Leverage TypeScript for framework, Python for data/ML heavy lifting
**Pattern**: BaseObserver in TS, domain plugins can spawn Python scripts (STRATEGIZE line 196-199)

---

## Conclusion

This THINK phase analyzed 8 edge cases, 5 alternative approaches, 5 architecture trade-offs, 6 failure modes, and 4 major risks. Key findings:

**Edge Cases**: All mitigatable with time budgets, cleanup, validation, and graceful degradation.

**Alternatives**: Generic framework (hybrid) is best balance of scalability and maintainability. Individual scripts too expensive, external tools useful where applicable.

**Trade-Offs**: YAML config (readability), tmp/ storage (consistency), synchronous execution (simplicity), graceful degradation (non-blocking).

**Risks**: Framework complexity (mitigate with minimal interface), domain expertise gaps (iterate), performance overhead (time budgets), disk bloat (cleanup + limits).

**Decisions**: 8 key decisions documented, all with clear rationale and trade-offs.

**Next Phase**: IMPLEMENT (for research task = documenting design artifacts, not code)

---

## References

- **STRATEGIZE**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/strategize.md`
- **SPEC**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/spec.md`
- **PLAN**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/plan.md`
- **Prior Art**: `docs/CRIT-PERF-FORECASTSTITCH-RESOLUTION.md`
- **Pattern Guide**: `docs/critics/RUNTIME_OBSERVATION_PATTERN.md`
- **IMP-FUND-05 Review**: `state/evidence/IMP-FUND-05-playwright-guard/review.md`
