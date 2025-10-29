# STRATEGIZE: Critics Systemic Performance Remediation

**Task**: CRIT-PERF-GLOBAL-9dfa06.1 - Research and design for [Critics] Systemic performance remediation
**Date**: 2025-10-28
**Phase**: STRATEGIZE

---

## Problem Discovery

### Root Cause: Stub Implementations Pattern

Investigation reveals a systemic issue affecting multiple critics across the codebase:

**Pattern**: Critics returning `null` from `command()` method
**Impact**: Critics are silently skipped with "skipped due to capability profile" message
**Scope**: Multiple critics affected (see list below)

### Evidence from Prior Work

**Reference**: `docs/CRIT-PERF-FORECASTSTITCH-RESOLUTION.md` (commit 23a9316c)
- ForecastStitchCritic had null command() → 12 consecutive failures
- Fixed by implementing actual monitoring script
- Pattern: Create Python/shell script + return command string

### Key Documentation

**Reference**: `docs/critics/RUNTIME_OBSERVATION_PATTERN.md`
- Paradigm shift: Runtime observation > Static analysis
- Each domain needs observable artifacts (screenshots, traces, plots, profiles)
- Universal template for observation critics

---

## Affected Critics Analysis

### Critics with Null Command Pattern

Preliminary grep shows multiple critics returning `null` from `command()` method:

1. `performance_observation.ts` - Returns null (line 126)
2. `api_observation.ts` - Likely similar pattern
3. `database_observation.ts` - Likely similar pattern
4. `data_observation.ts` - Likely similar pattern
5. `infrastructure_observation.ts` - Likely similar pattern

**Total**: ~5-10 critics likely affected (verification needed)

### Working Examples

**Good Pattern** (forecast_stitch.ts):
```typescript
const COMMAND =
  'PYTHONPATH=.deps:. python -m apps.worker.monitoring.forecast_stitch --summary-path state/analytics/forecast_stitch_watch.json';

protected command(profile: string): string | null {
  return COMMAND; // ✅ Returns actual command
}
```

---

## Performance Impact

### Current State

From `state/critics/*.json` analysis:
- Many critics have `duration_ms: null` (never executed)
- No runtime metrics being collected
- Silent failures with no actionable feedback

### Expected Improvements

After remediation:
- **Reliability**: Critics execute instead of being skipped
- **Observability**: Actual runtime metrics collected
- **Actionability**: Specific issues with evidence-based recommendations
- **Coverage**: Full critic suite operational

---

## Solution Approaches

### Approach 1: Individual Script Implementation (Forecast Stitch Pattern)

**For each critic:**
1. Create domain-specific monitoring script (Python preferred)
2. Implement runtime observation (API calls, profiling, query analysis)
3. Return structured JSON with pass/fail + recommendations
4. Update critic to return command string

**Pros**:
- High quality, domain-specific insights
- Reuses established pattern (forecast_stitch)
- Actionable recommendations

**Cons**:
- Time-intensive (~2-3 hours per critic)
- Requires domain expertise for each area
- Not suitable for research-only task

### Approach 2: Generic Observation Framework ⭐ RECOMMENDED

**Create reusable observation framework:**
1. Generic observation runner (TypeScript)
2. Domain-specific configuration files (YAML)
3. Pluggable analyzers for each domain
4. Shared reporting format

**Pros**:
- Scalable to many critics
- Consistent reporting format
- Easier to maintain
- Suitable for design phase

**Cons**:
- Upfront framework design needed
- May lack domain-specific depth initially

### Approach 3: Minimal Viable Implementation

**Quick fix for research phase:**
1. Update affected critics to return placeholder commands
2. Commands output minimal valid JSON
3. Defer full implementation to follow-up tasks

**Pros**:
- Fast, unblocks critics
- Demonstrates pattern

**Cons**:
- Minimal value without real observations
- Still requires follow-up work

---

## Recommended Strategy

### Phase 1: Design & Specification (This Task)

1. **Identify all affected critics** (complete inventory)
2. **Design generic observation framework**
   - Base observation runner
   - Configuration schema
   - Reporting format
   - Integration points
3. **Create implementation plan** for each critic type
4. **Define success metrics** and acceptance criteria

### Phase 2: Implementation (Follow-up Tasks)

Split into domain-specific tasks:
- **API Observation**: Request tracing, latency analysis
- **Database Observation**: Query profiling, EXPLAIN ANALYZE
- **Performance Observation**: CPU/memory profiling, flamegraphs
- **Data Observation**: Distribution plots, statistical tests
- **Infrastructure Observation**: Chaos testing, failover tests

### Phase 3: Verification & Iteration

- Run full critic suite
- Validate observations are meaningful
- Iterate on recommendations quality

---

## Success Criteria

This research task (CRIT-PERF-GLOBAL-9dfa06.1) succeeds when:

1. ✅ Complete inventory of affected critics
2. ✅ Generic observation framework designed
3. ✅ Implementation plan for each critic type
4. ✅ Configuration schema defined
5. ✅ Success metrics established
6. ✅ Evidence documented for design decisions

**NOT in scope for research task:**
- ❌ Implementing actual observation scripts
- ❌ Running critics end-to-end
- ❌ Production deployment

---

## Key Design Questions

### 1. Framework Architecture

**Question**: Unified observation runner vs per-domain scripts?

**Options**:
- A) Single TypeScript runner + YAML configs
- B) Per-domain Python scripts (forecast_stitch pattern)
- C) Hybrid: TypeScript framework + domain-specific plugins

**Recommendation**: Option C (hybrid)
- TypeScript framework handles lifecycle, config, reporting
- Domain plugins (Python/TypeScript) handle observation
- Best of both worlds: reuse + specialization

### 2. Configuration Management

**Question**: How to configure each critic's observations?

**Options**:
- A) Inline in critic class
- B) YAML config files (like screenshot_config.yaml)
- C) Database configuration

**Recommendation**: Option B (YAML config files)
- Follows existing pattern (screenshot_config.yaml)
- Easy to edit without code changes
- Versioned with code

### 3. Artifact Storage

**Question**: Where to store observation artifacts?

**Current patterns**:
- `tmp/screenshots/[session]/` - Playwright screenshots
- `state/critics/` - Critic execution results
- `state/analytics/` - Monitoring summaries

**Recommendation**: Consistent structure
```
tmp/critic-observations/[critic-name]/[session]/
  ├── artifacts/ (screenshots, plots, traces)
  ├── report.json (structured results)
  └── raw/ (raw data for debugging)
```

### 4. Reporting Format

**Question**: Standardize observation report schema?

**Proposed Schema**:
```typescript
interface ObservationReport {
  overall_score: number; // 0-100
  passed: boolean;
  timestamp: string;
  duration_ms: number;
  issues: Issue[];
  opportunities: Opportunity[];
  artifacts: string[]; // Paths to generated artifacts
  metrics: Record<string, number>;
}

interface Issue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string; // domain-specific
  issue: string;
  suggestion: string;
  evidence?: string; // path to artifact
}

interface Opportunity {
  pattern: string;
  observation: string;
  opportunity: string;
  potential_impact: string;
}
```

---

## Next Steps

1. **SPEC Phase**: Define acceptance criteria for observation framework
2. **PLAN Phase**: Create implementation plan with time estimates
3. **THINK Phase**: Analyze edge cases and alternatives
4. **Follow-up Tasks**: Implement per-domain observations

---

## References

- **Prior Art**: `docs/CRIT-PERF-FORECASTSTITCH-RESOLUTION.md`
- **Pattern Guide**: `docs/critics/RUNTIME_OBSERVATION_PATTERN.md`
- **Forecast Implementation**: `tools/wvo_mcp/src/critics/forecast_stitch.ts`
- **Monitoring Script**: `apps/worker/monitoring/forecast_stitch.py`
- **Base Critic**: `tools/wvo_mcp/src/critics/base.ts`
