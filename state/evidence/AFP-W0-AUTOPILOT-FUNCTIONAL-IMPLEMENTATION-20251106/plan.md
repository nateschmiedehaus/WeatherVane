# PLAN: Wave 0 Autopilot Functional Implementation

**Task ID:** AFP-W0-AUTOPILOT-FUNCTIONAL-IMPLEMENTATION-20251106
**Date:** 2025-11-06
**Owner:** Claude Council

---

## Execution Approach

**Execution order (micro-batched sub-tasks):**

```
1. MCP Client Integration (150 LOC)
   ↓
2. Phase Executors Part 1: STRATEGIZE/SPEC/PLAN (150 LOC)
   ↓
3. Phase Executors Part 2: THINK/GATE (150 LOC)
   ↓
4. Phase Executors Part 3: IMPLEMENT/VERIFY (150 LOC)
   ↓
5. Integration & Quality Gates (100 LOC)
```

**Rationale:**
- MCP client must exist first (enables all tool calls)
- Early phases (STRATEGIZE/SPEC/PLAN) establish context for later phases
- THINK/GATE validate approach before implementation
- IMPLEMENT/VERIFY do the actual work
- Final integration wires everything together

**Total: ~700 LOC across 5 micro-batches** (respects ≤150 LOC per batch limit)

---

## Task Breakdown

### Sub-Task 1: MCP Client Integration (~150 LOC)
**Approach:** Create minimal MCP client wrapper to call Claude Code tools
**Files:**
- `tools/wvo_mcp/src/wave0/mcp_client.ts` (new, ~150 LOC)

**Implementation:**
```typescript
// Minimal MCP client for Wave 0
export class MCPClient {
  async read(filePath: string): Promise<string>
  async edit(filePath: string, oldText: string, newText: string): Promise<void>
  async write(filePath: string, content: string): Promise<void>
  async bash(command: string): Promise<string>
  async grep(pattern: string, path?: string): Promise<string[]>
  async glob(pattern: string): Promise<string[]>
}
```

### Sub-Task 2: Phase Executors Part 1 (~150 LOC)
**Approach:** Implement STRATEGIZE, SPEC, PLAN phase executors
**Files:**
- `tools/wvo_mcp/src/wave0/phase_executors.ts` (new, ~150 LOC)

**Implementation:**
```typescript
export async function executeStrategize(task: Task, mcp: MCPClient): Promise<string>
export async function executeSpec(task: Task, mcp: MCPClient, context: PhaseContext): Promise<string>
export async function executePlan(task: Task, mcp: MCPClient, context: PhaseContext): Promise<string>
```

### Sub-Task 3: Phase Executors Part 2 (~150 LOC)
**Approach:** Implement THINK, GATE phase executors with quality gate integration
**Files:**
- `tools/wvo_mcp/src/wave0/phase_executors.ts` (extend, +150 LOC)

**Implementation:**
```typescript
export async function executeThink(task: Task, mcp: MCPClient, context: PhaseContext): Promise<string>
export async function executeGate(task: Task, mcp: MCPClient, context: PhaseContext): Promise<GateResult>
```

### Sub-Task 4: Phase Executors Part 3 (~150 LOC)
**Approach:** Implement IMPLEMENT, VERIFY phase executors
**Files:**
- `tools/wvo_mcp/src/wave0/phase_executors.ts` (extend, +150 LOC)

**Implementation:**
```typescript
export async function executeImplement(task: Task, mcp: MCPClient, context: PhaseContext): Promise<ImplementResult>
export async function executeVerify(task: Task, mcp: MCPClient, context: PhaseContext): Promise<VerifyResult>
```

### Sub-Task 5: Integration & Quality Gates (~100 LOC)
**Approach:** Wire phase executors into TaskExecutor, integrate quality gates
**Files:**
- `tools/wvo_mcp/src/wave0/task_executor.ts` (modify, ~100 LOC changes)

**Implementation:**
- Replace stub `performImplementation()` with real execution logic
- Call phase executors in sequence
- Integrate DesignReviewer and ProcessCritic
- Handle remediation loops

---

## Integration Points

**How components integrate:**
1. **TaskExecutor → MCPClient:** TaskExecutor creates MCPClient instance for tool calls
2. **TaskExecutor → PhaseExecutors:** TaskExecutor calls each phase executor in AFP sequence
3. **PhaseExecutors → EvidenceScaffolder:** Each phase writes results to evidence files
4. **PhaseExecutors → Critics:** GATE phase calls DesignReviewer, REVIEW phase calls ProcessCritic
5. **TaskExecutor → ProofIntegration:** After VERIFY, proof system validates results

**Shared components:**
- `MCPClient` - used by all phase executors
- `PhaseContext` - accumulates context across phases (strategy informs spec, spec informs plan, etc.)
- `EvidenceScaffolder` - writes all phase outputs to evidence files
- Existing infrastructure: LeaseManager, LifecycleTelemetry, ProofIntegration

---

## PLAN-authored Tests

**Tests designed before implementation:**

### Test 1: MCP Client Integration Test
**What it tests:** MCP client can call Claude Code tools
**Method:**
```typescript
// test/wave0/mcp_client.test.ts
describe('MCPClient', () => {
  it('should read file contents', async () => {
    const mcp = new MCPClient();
    const content = await mcp.read('package.json');
    expect(content).toContain('"name"');
  });

  it('should search with grep', async () => {
    const mcp = new MCPClient();
    const results = await mcp.grep('TODO', 'src/');
    expect(Array.isArray(results)).toBe(true);
  });
});
```
**Success criteria:** MCP client successfully calls Read and Grep tools, returns expected data

### Test 2: Phase Executor Unit Tests
**What it tests:** Each AFP phase executor produces valid output
**Method:**
```typescript
// test/wave0/phase_executors.test.ts
describe('Phase Executors', () => {
  it('executeStrategize should analyze WHY with evidence', async () => {
    const result = await executeStrategize(mockTask, mockMCP);
    expect(result).toContain('Problem Statement');
    expect(result).toContain('Root Cause');
    expect(result.length).toBeGreaterThan(500); // Not placeholder
  });

  it('executePlan should define PLAN-authored tests', async () => {
    const result = await executePlan(mockTask, mockMCP, context);
    expect(result).toContain('PLAN-authored Tests');
    expect(result).toMatch(/Test \d+:/); // At least one test defined
  });
});
```
**Success criteria:** Each phase executor returns substantive content (>500 chars), includes required sections

### Test 3: Quality Gate Integration Test
**What it tests:** DesignReviewer blocks/approves appropriately
**Method:**
```typescript
// test/wave0/quality_gates.test.ts
describe('Quality Gates', () => {
  it('should block on low-quality design', async () => {
    const poorDesign = 'TODO: design goes here'; // Placeholder
    const result = await runDesignReviewer(poorDesign);
    expect(result.status).toBe('blocked');
    expect(result.concerns.length).toBeGreaterThan(0);
  });

  it('should approve high-quality design', async () => {
    const goodDesign = generateValidDesign(); // With AFP/SCAS analysis
    const result = await runDesignReviewer(goodDesign);
    expect(result.status).toBe('approved');
  });
});
```
**Success criteria:** DesignReviewer correctly identifies low vs high quality designs

### Test 4: End-to-End Task Execution Test
**What it tests:** Wave 0 completes full task with real work
**Method:**
```bash
# test/wave0/e2e.test.sh
#!/bin/bash
# Create test task in roadmap
echo "- id: TEST-WAVE0-E2E
  title: Add test function
  status: pending" >> state/roadmap.yaml

# Run Wave 0
WAVE0_SINGLE_RUN=1 npm run wave0

# Verify evidence created
test -f state/evidence/TEST-WAVE0-E2E/strategy.md || exit 1
test -f state/evidence/TEST-WAVE0-E2E/implement.md || exit 1

# Verify real code changes
git diff --stat | grep -v "state/evidence" || exit 1

# Verify build still passes
npm run build || exit 1
```
**Success criteria:** Task completes, evidence generated, real code changes made, build passes

### Test 5: Error Handling Test
**What it tests:** Wave 0 handles errors gracefully
**Method:**
```typescript
// test/wave0/error_handling.test.ts
describe('Error Handling', () => {
  it('should escalate after 3 failed remediation attempts', async () => {
    const executor = new TaskExecutor(workspace);
    // Mock DesignReviewer to always block
    jest.spyOn(critics, 'runDesignReviewer').mockResolvedValue({
      status: 'blocked',
      concerns: ['test']
    });

    const result = await executor.execute(mockTask);
    expect(result.status).toBe('blocked');

    // Check escalation created
    const escalationPath = `state/escalations/${mockTask.id}-escalation.md`;
    expect(fs.existsSync(escalationPath)).toBe(true);
  });
});
```
**Success criteria:** After 3 failures, Wave 0 escalates to human, creates escalation file, marks task blocked

### Test 6: Git Safety Test
**What it tests:** Wave 0 maintains clean git worktree
**Method:**
```bash
# test/wave0/git_safety.test.sh
#!/bin/bash
# Run git fsck before
git fsck --full || exit 1

# Run Wave 0
WAVE0_SINGLE_RUN=1 npm run wave0

# Check no index.lock
test -f .git/index.lock && echo "FAIL: index.lock exists" && exit 1

# Run git fsck after
git fsck --full || exit 1

# Verify worktree clean (only evidence changes allowed)
git status --porcelain | grep -v "state/evidence" | grep -v "state/analytics" && exit 1

echo "Git safety test passed"
```
**Success criteria:** No index.lock created, git fsck passes, worktree remains clean

### Test 7: Performance Test
**What it tests:** Wave 0 completes standard task in <30 minutes
**Method:**
```typescript
// test/wave0/performance.test.ts
describe('Performance', () => {
  it('should complete standard task in <30 minutes', async () => {
    const startTime = Date.now();
    const executor = new TaskExecutor(workspace);

    await executor.execute(standardTestTask);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(30 * 60 * 1000); // 30 minutes
  });
}, 35 * 60 * 1000); // 35 minute timeout
```
**Success criteria:** Standard task completes in <30 minutes

**Note:** These tests must exist before IMPLEMENT phase. Tests may be failing initially, but they establish the contract for what Wave 0 must deliver.

---

## Via Negativa Analysis

**What can we DELETE/SIMPLIFY?**

**Option 1: Delete complex prioritization logic**
- Current: Wave0Runner has placeholder for complex task prioritization
- Simplification: Use first-found pending task (no prioritization in Wave 0.0)
- Impact: Simpler code, faster implementation, defer complexity to Wave 0.1

**Option 2: Delete multi-task planning**
- Current: Infrastructure suggests multi-task orchestration capability
- Simplification: Execute exactly 1 task at a time, sequential only
- Impact: Removes concurrency complexity, easier to debug

**Option 3: Delete advanced error recovery**
- Current: Complex error handling scenarios imagined
- Simplification: Basic retry (3 attempts) then escalate to human
- Impact: Simpler error handling, rely on human for complex cases

**Selected simplifications:**
1. ✅ First-found task selection (no prioritization)
2. ✅ Single-task execution (no parallelism)
3. ✅ Basic retry + escalation (no self-healing)

**Justification for additions:**
- MCP client is essential (cannot execute work without tool calls)
- Phase executors are essential (AFP compliance requirement)
- Quality gates are essential (prevent low-quality work)
- All additions directly enable core functionality (no nice-to-haves)

---

## Refactor vs Repair

**Symptom:** Wave 0 creates placeholder files but does no real work

**Root cause:** `performImplementation()` is a 3-line stub - execution engine was never built

**Approach:** **Root cause refactor**
- Not patching: We're not adding warnings or documentation about "Wave 0 doesn't work yet"
- Not working around: We're not creating manual scripts to simulate Wave 0
- Fixing root: We're implementing the missing execution engine

**Why this addresses root cause:**
1. Replaces stub with real implementation (directly fixes the gap)
2. Integrates MCP for actual tool execution (enables real work)
3. Implements all AFP phases (not just file creation)
4. Adds quality gates (ensures work quality)

This is completing an incomplete implementation, not patching symptoms.

---

## Risks and Mitigations

### Risk 1: MCP Integration Complexity
**Description:** MCP client may not exist or be difficult to integrate
**Mitigation:**
- Research existing MCP libraries first
- If none exist, create minimal wrapper using child_process to call CLI
- Fallback: Generate shell scripts that call `claude` CLI tool

### Risk 2: Token Consumption
**Description:** Wave 0 may consume excessive tokens with deep analysis
**Mitigation:**
- Limit file reads to 3-5 files per phase
- Use conservative prompts (focused questions, not open-ended)
- Monitor token usage in analytics, add circuit breaker if needed

### Risk 3: Quality Gate False Positives
**Description:** Critics may be too strict on AI-generated content
**Mitigation:**
- Start with 50% approval target (not 80%)
- Log all rejections to learn patterns
- Tune prompts based on common rejection reasons

### Risk 4: Implementation Time Overrun
**Description:** 700 LOC across 5 micro-batches may take longer than 1 week
**Mitigation:**
- Focus on minimal viable functionality (defer nice-to-haves)
- Reuse existing patterns from critics and supervisor code
- If needed, reduce scope (e.g., implement only 5 core phases initially)

---

## Architecture Design

### Component Architecture:
```
TaskExecutor (main orchestrator)
    ├── MCPClient (tool interface)
    │   ├── Read
    │   ├── Edit
    │   ├── Write
    │   ├── Bash
    │   ├── Grep
    │   └── Glob
    │
    ├── PhaseExecutors (AFP implementation)
    │   ├── executeStrategize()
    │   ├── executeSpec()
    │   ├── executePlan()
    │   ├── executeThink()
    │   ├── executeGate()
    │   ├── executeImplement()
    │   ├── executeVerify()
    │   └── executeReview()
    │
    ├── EvidenceScaffolder (existing)
    │   └── Writes phase outputs
    │
    ├── Critics Integration
    │   ├── DesignReviewer (GATE)
    │   └── ProcessCritic (REVIEW)
    │
    └── ProofIntegration (existing)
        └── Validates results
```

### Execution Flow:
```
1. TaskExecutor.execute(task)
2. Create MCPClient instance
3. Create PhaseContext (accumulates info)
4. For each AFP phase:
   a. Call phase executor
   b. Write results to evidence
   c. Update phase status
   d. Add to context for next phase
5. Run quality gates at GATE and REVIEW
6. If blocked, attempt remediation (max 3)
7. Update task status (done/blocked)
8. Run proof validation
9. Commit changes
```

---

## Implementation Plan

**Implementation Plan scope:**
- Create real MCP client for tool execution
- Implement all 10 AFP phase executors
- Add quality gate integration
- PLAN-authored tests: 7 tests created before IMPLEMENT (defined in PLAN-authored Tests section above)

**Deliverables:**
1. Functioning MCP client with real tool calls
2. Phase executors generating real content
3. Quality gates blocking/approving appropriately
4. 7 PLAN-authored tests passing

---

## Files and LOC Estimate

**Total estimates:**
- **Files affected:** 3 files
  - NEW: `tools/wvo_mcp/src/wave0/mcp_client.ts` (~150 LOC)
  - NEW: `tools/wvo_mcp/src/wave0/phase_executors.ts` (~450 LOC)
  - MOD: `tools/wvo_mcp/src/wave0/task_executor.ts` (~100 LOC changes)
- **Net LOC:** ~700 LOC
- **Duration:** 5-7 days (1-2 days design/planning, 3-4 days implementation, 1 day testing)
- **PLAN-authored tests:** 7 tests defined above (Test 1-7, lines 124-283)

**Within limits?**
- ✅ Each micro-batch ≤150 LOC
- ✅ Total scope reasonable for 1 week delivery
- ✅ Focused on essential functionality only
- ✅ PLAN-authored tests defined before IMPLEMENT

---

## Verification Strategy

**How we'll verify this works:**

1. **Unit tests pass:** All 7 PLAN-authored tests defined above
2. **Integration test:** Full task execution in TaskFlow harness
3. **Live validation:** Execute real task from roadmap
4. **Quality validation:** Generated evidence passes critics
5. **Performance validation:** Task completes in <30 minutes
6. **Safety validation:** Git worktree remains clean

**Success = All validations pass + task status updated to "done" with real work delivered**

---

**Plan complete:** 2025-11-06
**Next phase:** THINK (analyze edge cases and failure modes)
**Owner:** Claude Council

---

## Implementation Notes

### Critical Success Factors:
1. **MCP integration must work** - Without tool calls, nothing else matters
2. **Phase executors must produce real content** - Not placeholders
3. **Quality gates must be real** - Not bypassed or faked
4. **Tests must pass** - Both PLAN-authored and existing tests

### Deferring to Wave 0.1:
- Multi-task orchestration
- Intelligent prioritization
- Advanced error recovery
- Pattern recommendation
- Cross-task learning

**Focus: Get ONE task working end-to-end with real code changes and quality validation**