# Design V2: AFP-COGNITIVE-MODEL-ROUTING-20251106 (Fundamental)

## Via Negativa Pivot

**Original design:** Add phase_detector.ts module (380 LOC)

**Fundamental insight:** Work type ≠ reasoning level (orthogonal concerns)

**New design:** Extend reasoning_classifier.ts with work_type concept (60 LOC, 84% reduction)

---

## Context

**Problem:** Model selection doesn't distinguish cognitive work from implementation work.

**Root Cause:** Missing concept of "work type" - conflating AFP phase (WHAT phase) with reasoning depth (HOW MUCH to think).

**Goal:** Separate work type (cognitive/implementation/remediation) from reasoning level (high/medium/low).

---

## Architecture: Two Orthogonal Dimensions

### Dimension 1: Work Type (WHAT kind of work)

```typescript
export type WorkType =
  | 'cognitive'        // Strategy, planning, design
  | 'implementation'   // Coding, building
  | 'remediation'      // Fixing, patching
  | 'observational';   // Monitoring, reporting
```

**Inference cascade:**
1. `task.metadata.work_type` (explicit, highest priority)
2. Infer from `task.metadata.current_phase` (AFP phase → work type)
3. Infer from task title (e.g., "REMEDIATION: Fix tests")
4. Default: `implementation`

### Dimension 2: Reasoning Level (HOW DEEP to think)

**Already exists** in `reasoning_classifier.ts`:
- `high` - Deep strategic thinking
- `medium` - Balanced complexity analysis
- `low` - Fast implementation
- `minimal` - Simple operations

**Mapping:** Work Type → Reasoning Level

```typescript
function selectReasoningForWorkType(workType: WorkType, task: Task): ReasoningLevel {
  switch (workType) {
    case 'cognitive':
      return 'high';  // Always deep thinking
    case 'implementation':
      // Complexity-based (existing heuristics)
      return task.estimated_complexity >= 8 ? 'medium' : 'low';
    case 'remediation':
      return 'low';   // Fast iteration
    case 'observational':
      return 'minimal';
  }
}
```

### Then: Reasoning Level → Model + Extended Thinking

**Already exists** in `model_selector.ts`:
- `high` → gpt-5-high (Codex) or Opus-4 (Claude)
- `medium` → gpt-5-codex-medium
- `low` → gpt-5-codex-low

**NEW:** Map reasoning level → Claude extended thinking budget

```typescript
function getThinkingBudget(reasoningLevel: ReasoningLevel): number {
  return {
    high: 12000,    // Cognitive work: 12K tokens thinking
    medium: 4000,   // Complex implementation: 4K tokens
    low: 0,         // Standard work: no extended thinking
    minimal: 0      // Observational: no extended thinking
  }[reasoningLevel] || 0;
}
```

---

## Implementation: 60 LOC Total

### File 1: reasoning_classifier.ts (+30 LOC)

```typescript
// NEW TYPES
export type WorkType = 'cognitive' | 'implementation' | 'remediation' | 'observational';

// NEW FUNCTION
export function inferWorkType(task: Task): WorkType {
  // 1. Explicit metadata (highest priority)
  if (task.metadata?.work_type) {
    return task.metadata.work_type as WorkType;
  }

  // 2. Infer from AFP phase
  const phase = task.metadata?.current_phase as string;
  if (phase) {
    const COGNITIVE_PHASES = ['STRATEGIZE', 'SPEC', 'PLAN', 'THINK', 'GATE', 'REVIEW'];
    if (COGNITIVE_PHASES.includes(phase)) {
      return 'cognitive';
    }
    if (['IMPLEMENT', 'VERIFY'].includes(phase)) {
      return 'implementation';
    }
  }

  // 3. Infer from title
  const title = task.title.toUpperCase();
  if (title.includes('REMEDIATION') || title.includes('FIX') || title.includes('HOTFIX')) {
    return 'remediation';
  }
  if (title.includes('MONITOR') || title.includes('OBSERVE')) {
    return 'observational';
  }

  // 4. Default
  return 'implementation';
}

// ENHANCED FUNCTION (add 5 lines at top)
export function inferReasoningRequirement(task: Task, context: AssembledContext): ReasoningDecision {
  // NEW: Work type is highest priority signal
  const workType = inferWorkType(task);

  if (workType === 'cognitive') {
    return {
      level: 'high',
      score: 2.0,
      confidence: 0.95,
      signals: [{ reason: `Cognitive work (${task.metadata?.current_phase || 'inferred'}) requires deep thinking`, weight: 2.0 }],
      override: 'metadata'
    };
  }

  if (workType === 'remediation') {
    return {
      level: 'low',
      score: 0.5,
      confidence: 0.90,
      signals: [{ reason: 'Remediation prioritizes fast iteration', weight: 0.5 }],
      override: 'metadata'
    };
  }

  // EXISTING: Continue with task-based inference for implementation work
  const override = extractMetadataOverride(task.metadata);
  if (override) {
    return {
      level: override.level,
      score: levelToScore(override.level),
      confidence: 0.95,
      signals: [{ reason: override.reason, weight: levelToScore(override.level) }],
      override: override.source,
    };
  }

  // ... rest of existing logic unchanged ...
}
```

### File 2: agent_coordinator.ts (+30 LOC)

```typescript
// NEW FUNCTION
function getThinkingBudget(reasoningLevel: ReasoningLevel): number {
  const budgets: Record<ReasoningLevel, number> = {
    high: 12000,      // Cognitive work
    medium: 4000,     // Complex implementation
    low: 0,           // Standard implementation
    minimal: 0        // Observational
  };
  return budgets[reasoningLevel] || 0;
}

// MODIFIED FUNCTION (add extended thinking support)
async function executeWithAgent(
  agent: Agent,
  task: Task,
  context: AssembledContext,
  // ... existing params
): Promise<ExecutionOutcome> {

  // ... existing code ...

  // NEW: For Claude agents, add extended thinking
  if (agent.type === 'claude' || agent.type === 'claude_code') {
    const reasoningDecision = inferReasoningRequirement(task, context);
    const thinkingBudget = getThinkingBudget(reasoningDecision.level);

    if (thinkingBudget > 0) {
      logInfo('Enabling extended thinking for Claude', {
        taskId: task.id,
        reasoningLevel: reasoningDecision.level,
        thinkingBudget,
        workType: inferWorkType(task)
      });

      // Add thinking config to request
      requestConfig.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget
      };

      // Use Opus 4 for extended thinking
      requestConfig.model = 'claude-opus-4';
    }
  }

  // ... rest of existing logic ...
}
```

---

## Testing: Unit + Integration

### Unit Tests (reasoning_classifier.test.ts)

```typescript
describe('inferWorkType', () => {
  it('returns cognitive for STRATEGIZE phase', () => {
    const task = { id: 'T1', metadata: { current_phase: 'STRATEGIZE' } };
    expect(inferWorkType(task)).toBe('cognitive');
  });

  it('returns implementation for IMPLEMENT phase', () => {
    const task = { id: 'T1', metadata: { current_phase: 'IMPLEMENT' } };
    expect(inferWorkType(task)).toBe('implementation');
  });

  it('returns remediation for REMEDIATION title', () => {
    const task = { id: 'T1', title: 'REMEDIATION: Fix build' };
    expect(inferWorkType(task)).toBe('remediation');
  });

  it('prefers explicit work_type over phase', () => {
    const task = {
      id: 'T1',
      metadata: { work_type: 'observational', current_phase: 'IMPLEMENT' }
    };
    expect(inferWorkType(task)).toBe('observational');
  });
});

describe('inferReasoningRequirement with work types', () => {
  it('returns high reasoning for cognitive work', () => {
    const task = { id: 'T1', metadata: { work_type: 'cognitive' } };
    const decision = inferReasoningRequirement(task, {});
    expect(decision.level).toBe('high');
    expect(decision.override).toBe('metadata');
  });

  it('returns low reasoning for remediation work', () => {
    const task = { id: 'T1', metadata: { work_type: 'remediation' } };
    const decision = inferReasoningRequirement(task, {});
    expect(decision.level).toBe('low');
  });
});

describe('getThinkingBudget', () => {
  it('returns 12K tokens for high reasoning', () => {
    expect(getThinkingBudget('high')).toBe(12000);
  });

  it('returns 0 tokens for low reasoning', () => {
    expect(getThinkingBudget('low')).toBe(0);
  });
});
```

### Integration Test (Wave 0)

```typescript
// Create test task
const testTask = {
  id: 'AFP-COGNITIVE-MODEL-TEST-20251106',
  title: 'Test cognitive model routing',
  metadata: {
    current_phase: 'STRATEGIZE',
    work_type: 'cognitive'  // explicit
  }
};

// Add to roadmap
// Start Wave 0
// Verify telemetry shows:
// - workType: 'cognitive'
// - reasoningLevel: 'high'
// - model: 'claude-opus-4'
// - thinkingBudget: 12000
// - thinking_tokens_used: >0
```

---

## LOC Comparison

| Component | Approach A (Tactical) | Approach C (Fundamental) | Savings |
|-----------|----------------------|--------------------------|---------|
| New modules | phase_detector.ts (120 LOC) | 0 | 120 LOC |
| Test files | phase_detector.test.ts (100 LOC) | 0 | 100 LOC |
| Config files | phase_model_config.json (50 LOC) | 0 | 50 LOC |
| reasoning_classifier | 0 | +30 LOC | -30 LOC |
| model_selector | +40 LOC | 0 | 40 LOC |
| agent_coordinator | +60 LOC | +30 LOC | 30 LOC |
| state_machine | +10 LOC | 0 | 10 LOC |
| **TOTAL** | **380 LOC** | **60 LOC** | **320 LOC (84%)** |

---

## AFP/SCAS Validation

### Economy ✅
- **Via Negativa:** 84% code reduction (320 LOC deleted from design)
- **Minimal addition:** 60 LOC vs 380 LOC
- **No new modules:** Extends existing reasoning_classifier

### Coherence ✅
- **Matches mental model:** "What work?" vs "How deep?"
- **Reuses patterns:** Metadata cascade, existing reasoning inference
- **Natural extension:** Work type is just another signal

### Autonomy ✅
- **Autopilot-friendly:** Infers work type from phase
- **Explicit override:** Set `work_type` in metadata
- **Graceful fallback:** Defaults to implementation

### Simplicity ✅
- **Two orthogonal concepts:** Work type ≠ Reasoning level
- **Clear mapping:** Work → Reasoning → Model → Extended thinking
- **No tangling:** Each concern separate

### Speed ✅
- **Minimal overhead:** One additional function call
- **No file I/O:** No evidence folder scanning
- **Fast inference:** O(1) metadata lookup

---

## Decision: Proceed with Approach C

**Rationale:**
- ✅ 84% less code than original design
- ✅ Cleaner architecture (orthogonal concerns)
- ✅ Same functionality (phase-aware routing + extended thinking)
- ✅ More extensible (new work types without code changes)
- ✅ Longest-term AFP/SCAS solution

**Ready for IMPLEMENT phase.**
