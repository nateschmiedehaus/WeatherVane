# Meta-Process Improvement Protocol
## Preventing Architectural Oversights and Integration Gaps

**Root Cause**: Worker architecture misunderstanding not caught until test phase
**Impact**: Wasted 2+ hours implementing wrong solution
**User Directive**: "This should've been seen WAY in advance - fundamental problem with our work process"

---

## Problem Analysis: Where Did We Fail?

### Timeline of Failure

| Stage | What We Did | What We SHOULD Have Done | Gap |
|-------|-------------|--------------------------|-----|
| **STRATEGIZE** | Assumed autopilot = standalone process | Research actual architecture first | ❌ No architecture discovery |
| **SPEC** | Defined safety for "autonomous process" | Verify entry point and architecture | ❌ No entry point verification |
| **PLAN** | Created supervisor for standalone worker | Check how autopilot actually starts | ❌ No startup mechanism research |
| **IMPLEMENT** | Built supervisor + integrated to UnifiedOrchestrator | Integrate to OrchestratorRuntime (actual entry) | ❌ Wrong integration point |
| **VERIFY** | Build passed, tests passed | Should have FAILED: entry point not checked | ❌ Incomplete verification |
| **TEST** | Discovered worker is IPC-based, not standalone | Should have been caught in STRATEGIZE | ❌ Too late! |

### Root Causes

1. **No Architecture Discovery Phase**: Started implementing without understanding system
2. **Assumption-Based Design**: Assumed entry point instead of verifying
3. **Incomplete STRATEGIZE**: Didn't include "verify current architecture" step
4. **Weak Verification**: Build success ≠ integration success
5. **No Entry Point Validation**: Never checked if autopilot_unified.js even exists

---

## The Meta-Process: Strategize → Monitor (Applied to Process Itself)

We need to apply the SAME rigorous protocol to our development process that we apply to code.

### STRATEGIZE: Meta-Process Improvement

**Goal**: Eliminate architectural oversights and integration gaps

**Problem Classification**:
- **Type**: Process oversight / premature implementation
- **Severity**: High (wasted hours, wrong solution)
- **Frequency**: Pattern observed multiple times (ComplexityRouter, HeartbeatWriter, now this)

**Root Pattern**: **"Implement first, discover architecture later"**

**Required Change**: **"Discover architecture first, implement to fit"**

### SPEC: Mandatory Architecture Discovery Phase

Add new **Stage 0.5: DISCOVER** between STRATEGIZE and SPEC:

```markdown
### Stage 0.5: DISCOVER (Mandatory for ALL integration tasks)

**Goal**: Understand existing architecture BEFORE designing solution

**Required Research** (MUST complete ALL):

1. **Entry Point Discovery**
   ```bash
   # Find all entry points
   find . -name "*entry*.ts" -o -name "*main*.ts" -o -name "index.ts"

   # Check package.json scripts
   cat package.json | jq '.scripts'

   # Trace actual startup
   # Example: "auto:claude" script shows real entry point
   ```

   **Output**: Document ACTUAL entry point used in production

2. **Architecture Diagram**
   ```
   Draw (even text-based) showing:
   - Entry point
   - Runtime/orchestrator
   - Worker pools
   - IPC vs standalone
   - Where new feature should integrate
   ```

   **Output**: Visual or text diagram of integration points

3. **Integration Point Identification**
   ```bash
   # Find where similar features are integrated
   grep -r "similar_feature" src/

   # Check which orchestrator is actually used
   grep -r "class.*Orchestrator" src/
   ```

   **Output**: List of classes/files that will need changes

4. **Existing Pattern Analysis**
   ```bash
   # How do OTHER safety features work?
   grep -r "safety\|limit\|monitor" src/

   # Follow the pattern
   ```

   **Output**: Document existing patterns to follow

5. **Assumption Validation**
   - List ALL assumptions about architecture
   - Verify EACH assumption with code search
   - Document which assumptions were WRONG

   **Example from this task**:
   ```
   ASSUMPTION: Autopilot is standalone process ❌ WRONG
   REALITY: Autopilot is IPC worker responding to messages
   FOUND BY: Searching for "worker_entry", reading actual code
   ```

**Exit Criteria**:
- ✅ Entry point identified and verified to exist
- ✅ Architecture diagram drawn
- ✅ Integration points mapped to actual code
- ✅ All assumptions validated (not assumed)
- ✅ Existing patterns documented

**If ANY criterion fails** → STOP and escalate to user
```

### PLAN: Integration Point Verification

Update PLAN stage to require integration point verification:

```markdown
### Stage 2: PLAN

**New Requirement**: Integration Point Matrix

| Feature | Current Location | Target Integration Point | Verified? |
|---------|-----------------|-------------------------|-----------|
| HeartbeatWriter | N/A (new) | OrchestratorRuntime.start() | ✅ Checked: runtime.ts exists |
| SafetyMonitor | N/A (new) | OrchestratorRuntime.start() | ✅ Checked: runtime.ts exists |
| Supervisor script | N/A (new) | Calls dist/worker/worker_entry.js | ✅ Checked: entry.js exists |

**Verification Commands**:
```bash
# Verify integration points exist
test -f src/orchestrator/orchestrator_runtime.ts || echo "ERROR: Runtime not found"
test -f dist/worker/worker_entry.js || echo "ERROR: Entry point not found"

# Verify they use each other correctly
grep "OrchestratorRuntime" dist/worker/worker_entry.js || echo "ERROR: Not using runtime"
```

**Exit Criteria**:
- ✅ All integration points verified to exist
- ✅ Integration commands documented
- ✅ No assumptions in plan (only verified facts)
```

### IMPLEMENT: Existence-Driven Development

Add mandatory checks DURING implementation:

```bash
#!/usr/bin/env bash
# Pre-implementation checks (run BEFORE writing code)

echo "=== Pre-Implementation Verification ==="

# 1. Integration target exists?
if [ ! -f "src/orchestrator/orchestrator_runtime.ts" ]; then
  echo "❌ Integration target doesn't exist!"
  echo "STOP: Re-run DISCOVER phase"
  exit 1
fi

# 2. Entry point uses integration target?
if ! grep -q "OrchestratorRuntime" "dist/worker/worker_entry.js"; then
  echo "❌ Entry point doesn't use OrchestratorRuntime!"
  echo "STOP: Wrong integration point"
  exit 1
fi

# 3. Similar features exist to pattern-match?
if ! grep -q "import.*from.*utils" "src/orchestrator/orchestrator_runtime.ts"; then
  echo "⚠️ Warning: No similar imports found, verify import pattern"
fi

echo "✅ Pre-implementation checks passed"
echo "Safe to implement"
```

**Rule**: Run pre-implementation checks BEFORE writing any code.

### VERIFY: Architectural Integration Tests

Add mandatory integration tests to VERIFY stage:

```typescript
// scripts/verify_integration_architecture.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('Architectural Integration Verification', () => {
  it('Entry point uses correct orchestrator', () => {
    const entryPoint = fs.readFileSync('dist/worker/worker_entry.js', 'utf-8');

    // Verify worker_entry uses OrchestratorRuntime
    expect(entryPoint).toContain('OrchestratorRuntime');
    expect(entryPoint).not.toContain('UnifiedOrchestrator'); // Wrong one
  });

  it('Safety features integrated into runtime', () => {
    const runtime = fs.readFileSync('src/orchestrator/orchestrator_runtime.ts', 'utf-8');

    // Verify HeartbeatWriter is imported and used
    expect(runtime).toContain('HeartbeatWriter');
    expect(runtime).toMatch(/heartbeatWriter\s*=\s*new HeartbeatWriter/);
    expect(runtime).toMatch(/heartbeatWriter\.start\(\)/);

    // Verify SafetyMonitor is imported and used
    expect(runtime).toContain('SafetyMonitor');
    expect(runtime).toMatch(/safetyMonitor\s*=\s*new SafetyMonitor/);
    expect(runtime).toMatch(/safetyMonitor\.start\(\)/);
  });

  it('Supervisor script uses correct entry point', () => {
    const supervisor = fs.readFileSync('tools/wvo_mcp/scripts/supervise_autopilot.sh', 'utf-8');

    // Verify path is correct
    expect(supervisor).toContain('dist/worker/worker_entry.js');
    expect(supervisor).not.toContain('autopilot_unified.js'); // Doesn't exist
  });

  it('All documented files exist', () => {
    const planDocs = glob.sync('docs/autopilot/*PLAN*.md');
    const expectedFiles = extractExpectedFiles(planDocs);

    for (const file of expectedFiles) {
      expect(fs.existsSync(file), `File ${file} documented but missing`).toBe(true);
    }
  });
});
```

**These tests MUST pass before claiming VERIFY stage complete.**

### REVIEW: Architectural Soundness Check

Add architectural review checklist:

```markdown
### Stage 6: REVIEW

**New Section: Architectural Soundness**

- [ ] Entry point verified (not assumed)
- [ ] Integration point is the ACTUAL runtime path (not a side path)
- [ ] No orphaned code (features built but not called)
- [ ] No duplicate functionality (didn't reinvent existing patterns)
- [ ] Architecture diagram matches implementation
- [ ] All documented files actually exist

**Adversarial Questions**:
- "How do I KNOW this is the right entry point?" (Show grep output)
- "What if there are multiple orchestrators?" (Show which one is actually used)
- "How do I KNOW the feature will be called?" (Show the call chain)
- "What if I'm integrating to the wrong class?" (Show entry point analysis)

**If ANY check fails** → Loop back to DISCOVER
```

---

## Mandatory Checkpoints: Fail-Fast Mechanisms

### Checkpoint 1: After STRATEGIZE

```bash
# Automated check
if grep -q "assume\|probably\|should be\|likely" docs/autopilot/*STRATEGIZE*.md; then
  echo "❌ FAIL: Strategy contains assumptions"
  echo "REQUIRED: Replace assumptions with verified facts"
  exit 1
fi

if ! grep -q "entry point.*verified\|architecture.*discovered" docs/autopilot/*STRATEGIZE*.md; then
  echo "❌ FAIL: No architecture discovery documented"
  echo "REQUIRED: Run DISCOVER phase"
  exit 1
fi
```

### Checkpoint 2: After PLAN

```bash
# Verify all integration targets exist
for FILE in $(grep -oE "src/[a-zA-Z0-9_/]+\.ts" docs/autopilot/*PLAN*.md); do
  if [ ! -f "$FILE" ]; then
    echo "❌ FAIL: Integration target $FILE doesn't exist"
    echo "REQUIRED: Re-run DISCOVER to find correct target"
    exit 1
  fi
done
```

### Checkpoint 3: After IMPLEMENT

```bash
# Run integration architecture tests
npm test -- integration_architecture.test.ts

if [ $? -ne 0 ]; then
  echo "❌ FAIL: Integration architecture tests failed"
  echo "REQUIRED: Fix integration points"
  exit 1
fi
```

---

## Prevention at Meta^2 Level: Process Health Monitoring

### Weekly Process Audit

```bash
#!/usr/bin/env bash
# scripts/audit_process_health.sh
# Run weekly to detect process degradation

ISSUES=0

echo "=== Process Health Audit ==="

# 1. Check for recent integration gaps
RECENT_GAPS=$(grep -r "integration gap\|wrong entry point\|didn't exist" docs/ --include="*.md" -l | wc -l)

if [ "$RECENT_GAPS" -gt 2 ]; then
  echo "⚠️ Warning: $RECENT_GAPS integration gaps in recent docs"
  echo "ACTION: Review DISCOVER phase compliance"
  ISSUES=$((ISSUES + 1))
fi

# 2. Check for assumption-based strategies
ASSUMPTION_COUNT=$(grep -r "assume\|probably\|should be" docs/autopilot/*STRATEGIZE*.md 2>/dev/null | wc -l)

if [ "$ASSUMPTION_COUNT" -gt 0 ]; then
  echo "❌ Found $ASSUMPTION_COUNT assumptions in STRATEGIZE docs"
  echo "ACTION: Enforce verification requirement"
  ISSUES=$((ISSUES + 1))
fi

# 3. Check DISCOVER phase compliance
RECENT_TASKS=$(find docs/autopilot -name "*STRATEGIZE*.md" -mtime -7)
DISCOVER_DOCS=$(find docs/autopilot -name "*DISCOVER*.md" -mtime -7)

TASK_COUNT=$(echo "$RECENT_TASKS" | wc -l)
DISCOVER_COUNT=$(echo "$DISCOVER_DOCS" | wc -l)

if [ "$TASK_COUNT" -gt "$DISCOVER_COUNT" ]; then
  echo "❌ $TASK_COUNT tasks started, only $DISCOVER_COUNT DISCOVER docs"
  echo "ACTION: DISCOVER phase being skipped!"
  ISSUES=$((ISSUES + 1))
fi

# 4. Check for orphaned implementations
ORPHANED=$(find src/ -name "*.ts" -mtime -7 -exec grep -l "export class" {} \; | while read -r file; do
  CLASS=$(grep "export class" "$file" | head -1 | awk '{print $3}')
  if ! grep -r "$CLASS" src/ --exclude="$(basename $file)" -q; then
    echo "$file: $CLASS (not imported anywhere)"
  fi
done)

if [ -n "$ORPHANED" ]; then
  echo "❌ Found orphaned implementations:"
  echo "$ORPHANED"
  ISSUES=$((ISSUES + 1))
fi

echo ""
if [ $ISSUES -eq 0 ]; then
  echo "✅ Process health: GOOD"
else
  echo "❌ Process health: $ISSUES issue(s) detected"
  echo ""
  echo "RECOMMENDED: Schedule process improvement review"
fi

exit $ISSUES
```

### Monthly Meta-Retrospective

Every month, run retrospective on the process itself:

```markdown
## Monthly Process Retrospective

### Questions to Answer

1. **How many integration gaps occurred this month?**
   - Acceptable: 0-1
   - Warning: 2-3
   - Critical: 4+

2. **How many tasks skipped DISCOVER phase?**
   - Acceptable: 0
   - Warning: 1-2
   - Critical: 3+

3. **How many "wrong entry point" issues?**
   - Acceptable: 0
   - Warning: 1
   - Critical: 2+

4. **Average time wasted on rework?**
   - Acceptable: < 1 hour/week
   - Warning: 1-3 hours/week
   - Critical: > 3 hours/week

### Actions Based on Results

| Metric | Status | Action |
|--------|--------|--------|
| Integration gaps: 3 | ⚠️ Warning | Add more DISCOVER enforcement |
| Skipped DISCOVER: 0 | ✅ Good | Continue current process |
| Wrong entry points: 2 | ❌ Critical | Make DISCOVER mandatory with automation |
| Rework time: 4hrs | ❌ Critical | Add pre-implementation checks |

### Process Improvements This Month

Document improvements made to prevent future issues:

- Added DISCOVER phase (mandatory)
- Created integration architecture tests
- Implemented fail-fast checkpoints
- Added weekly process health audits
```

---

## Concrete Example: How DISCOVER Would Have Prevented This

### What Actually Happened (Without DISCOVER)

```
STRATEGIZE: "Add safety supervision to autopilot"
  ↓ (ASSUMPTION: autopilot = standalone process)
SPEC: "Supervisor monitors autopilot process"
  ↓ (ASSUMPTION: autopilot_unified.js exists)
PLAN: "Create supervise_autopilot.sh"
  ↓ (ASSUMPTION: can start with `node autopilot_unified.js`)
IMPLEMENT: Build supervisor, integrate to UnifiedOrchestrator
  ↓ (WRONG: UnifiedOrchestrator not used by entry point)
TEST: Discover worker_entry.js is IPC-based, not standalone
  ↓
FAIL: 2+ hours wasted, wrong integration point
```

### What Would Have Happened (With DISCOVER)

```
STRATEGIZE: "Add safety supervision to autopilot"
  ↓
DISCOVER:
  1. Find entry point:
     $ cat package.json | jq '.scripts.auto'
     → "claude chat --mcp weathervane"
     → Uses MCP server, not standalone script

  2. Find worker code:
     $ find . -name "*worker*entry*.ts"
     → src/worker/worker_entry.ts

  3. Check worker architecture:
     $ grep "process.on.*message" src/worker/worker_entry.ts
     → IPC-based worker, not standalone

  4. Find actual orchestrator:
     $ grep "OrchestratorRuntime" src/worker/worker_entry.ts
     → Uses OrchestratorRuntime, NOT UnifiedOrchestrator

  5. Document reality:
     ✅ Entry point: worker_entry.js (IPC worker)
     ✅ Orchestrator: OrchestratorRuntime
     ✅ Architecture: MCP server → IPC worker
     ❌ WRONG ASSUMPTION: No standalone autopilot process exists

  6. Revise strategy:
     ACTUAL NEED: Integrate safety into OrchestratorRuntime
     OR: Create wrapper script that starts MCP + Claude CLI
  ↓
SPEC: "Integrate HeartbeatWriter + SafetyMonitor into OrchestratorRuntime"
  ↓ (NO ASSUMPTIONS - all verified)
PLAN: "Modify orchestrator_runtime.ts, test with worker_entry.js"
  ↓
IMPLEMENT: Integrate to correct class (OrchestratorRuntime)
  ↓
TEST: Works correctly on first try
  ↓
SUCCESS: 2+ hours saved, correct integration
```

**Time Saved**: 2-4 hours of rework
**Confidence**: High (based on verified facts, not assumptions)

---

## Summary: Meta-Process Improvements

### New Mandatory Stage

```
Strategize → **DISCOVER** → Spec → Plan → Think → Implement → Verify → Review → PR → Monitor
                  ↑
            NEW STAGE
      (Architecture Discovery)
```

### Key Principles

1. **Verify, Don't Assume**: Every architectural decision must be verified with code/commands
2. **Discover Before Design**: Understand existing system before adding to it
3. **Fail Fast**: Automated checks catch assumptions before they become implementations
4. **Integration-First Always**: Start with entry point, work backwards to feature
5. **Process Health Monitoring**: Weekly/monthly audits of process compliance

### Success Metrics

| Metric | Baseline (Before) | Target (After) | How to Measure |
|--------|-------------------|----------------|----------------|
| Integration gaps per month | 3-5 | 0-1 | Count "integration gap" in docs |
| Hours wasted on rework | 4-8/week | < 1/week | Time tracking |
| Wrong entry point issues | 2-3/month | 0/month | Count "wrong entry point" in docs |
| DISCOVER compliance | 0% | 100% | Count DISCOVER docs vs tasks |
| Architecture tests passing | N/A | 100% | CI status |

### Rollout Plan

**Week 1**: Create DISCOVER templates and integration tests
**Week 2**: Enforce DISCOVER for new tasks (manual review)
**Week 3**: Add automated fail-fast checkpoints
**Week 4**: First weekly process health audit
**Month 1**: First monthly meta-retrospective

---

## Conclusion

**The Problem**: Architectural oversights cause hours of wasted effort

**The Solution**: Mandatory architecture discovery BEFORE design

**The Meta-Lesson**: Apply the same rigor to our process that we apply to code

**The Goal**: **Zero architectural oversights through systematic discovery**

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Owner**: Claude (Meta-Process Guardian)
**Review Frequency**: Monthly or after any integration gap incident
