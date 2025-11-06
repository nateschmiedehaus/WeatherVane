# Via Negativa Analysis: Longest-Term AFP/SCAS Solution

## The Question

**Current design:** Add phase_detector.ts (~380 LOC) to route models based on AFP phases

**Challenge:** What's the LONGEST-TERM, most AFP/SCAS solution?

---

## Via Negativa: What Can We DELETE?

### Current State Analysis

**We already have:**
1. `reasoning_classifier.ts` - Infers reasoning level from task signals
2. `model_selector.ts` - Picks models based on reasoning level
3. `task.metadata` - Can store arbitrary data including phase
4. `critic_model_selector.ts` - Routes critic work to appropriate models

**Observation:** We're DUPLICATING inference logic
- reasoning_classifier infers "how much to think"
- phase_detector would infer "what kind of work"
- Both affect model selection

**Via Negativa opportunity:** MERGE instead of ADD

---

## Three Approaches: Tactical → Strategic → Fundamental

### Approach A: Tactical (What I Designed)
**Add phase detection layer**

```
Task → PhaseDetector → Model routing → Extended thinking
         (new 380 LOC)
```

**Pros:**
- Explicit phase detection
- Clear separation of concerns
- Testable

**Cons:**
- +380 LOC (violates economy)
- New module to maintain
- Duplicates inference logic
- Tactical solution (solves immediate need, not root cause)

**AFP/SCAS Score: 6/10**
- ❌ Economy: Adding significant code
- ✅ Coherence: Matches existing patterns
- ✅ Autonomy: Autopilot can detect phases
- ⚠️ Simplicity: Adds complexity

---

### Approach B: Strategic (Via Negativa)
**Extend existing reasoning classifier**

```
Task → reasoning_classifier (enhanced) → Model selection
       (check phase metadata)     (existing logic)
```

**Implementation:**
```typescript
// reasoning_classifier.ts - just add 20 LOC

export function inferReasoningRequirement(task: Task, context: AssembledContext): ReasoningDecision {
  // NEW: Check phase metadata first (highest priority signal)
  const phase = task.metadata?.current_phase as string;
  if (phase && isCognitivePhase(phase)) {
    return {
      level: 'high',
      score: 2.0,
      confidence: 0.95,
      signals: [{ reason: `Cognitive phase: ${phase}`, weight: 2.0 }],
      override: 'metadata'
    };
  }

  // EXISTING: Task-based inference continues...
}

function isCognitivePhase(phase: string): boolean {
  return ['STRATEGIZE', 'SPEC', 'PLAN', 'THINK', 'GATE', 'REVIEW'].includes(phase);
}
```

**Pros:**
- +20 LOC vs +380 LOC (95% less code)
- No new modules
- Reuses existing inference
- Phase metadata is highest-priority signal

**Cons:**
- Conflates "work type" with "reasoning level"
- Claude extended thinking still needs agent_coordinator changes
- Less explicit than dedicated module

**AFP/SCAS Score: 8/10**
- ✅ Economy: Minimal addition
- ✅ Coherence: Uses existing inference
- ✅ Autonomy: Same autopilot capability
- ✅ Simplicity: No new abstractions

---

### Approach C: Fundamental (Deepest SCAS)
**Separate work type from reasoning level**

**Key insight:** Work type ≠ Reasoning level

Current confusion:
- "Cognitive phase" → high reasoning
- "Implementation phase" → medium reasoning

But these are TWO ORTHOGONAL dimensions:
1. **Work Type:** What kind of work? (cognitive, implementation, remediation)
2. **Reasoning Level:** How deep to think? (minimal, low, medium, high)

**New architecture:**

```typescript
// New: First-class work type
export type WorkType = 'cognitive' | 'implementation' | 'remediation' | 'observational';

export interface TaskContext {
  workType: WorkType;        // WHAT kind of work
  reasoningLevel: ReasoningLevel;  // HOW DEEP to think
}

// Infer work type from phase
function inferWorkType(task: Task): WorkType {
  const phase = task.metadata?.current_phase;
  if (!phase) return 'implementation'; // default

  if (['STRATEGIZE', 'SPEC', 'PLAN', 'THINK', 'GATE', 'REVIEW'].includes(phase)) {
    return 'cognitive';
  }
  if (['IMPLEMENT', 'VERIFY'].includes(phase)) {
    return 'implementation';
  }
  if (task.title.includes('REMEDIATION')) {
    return 'remediation';
  }
  return 'implementation';
}

// Then map work type → reasoning level
function selectReasoningForWorkType(workType: WorkType, task: Task): ReasoningLevel {
  switch (workType) {
    case 'cognitive':
      return 'high';  // Always deep thinking for cognitive work
    case 'implementation':
      return task.estimated_complexity >= 8 ? 'medium' : 'low';
    case 'remediation':
      return 'low';  // Fast iteration
    case 'observational':
      return 'minimal';
  }
}
```

**Why this is more fundamental:**

1. **Separates concerns:** Work type vs thinking depth are independent
2. **Extensible:** Add new work types without touching reasoning logic
3. **Clear semantics:** "This is cognitive work that needs high reasoning" vs "This is phase STRATEGIZE"
4. **Future-proof:** Works for non-AFP workflows too

**Implementation:**
- `task.metadata.work_type` (explicit, highest priority)
- Infer from phase if not set
- Map work_type → reasoning_level
- Existing model_selector uses reasoning_level

**LOC estimate:** +60 LOC total
- +30 LOC in reasoning_classifier
- +30 LOC in agent_coordinator (extended thinking support)

**Pros:**
- Fundamental architecture (not tactical fix)
- Clean separation of concerns
- Extensible to non-AFP work
- Still minimal code (+60 LOC vs +380)

**Cons:**
- Introduces new concept (work type)
- Requires updating Task type
- More conceptual shift

**AFP/SCAS Score: 9.5/10**
- ✅ Economy: Minimal code, clear abstraction
- ✅ Coherence: Matches mental model (work type ≠ reasoning)
- ✅ Autonomy: Same capability, cleaner semantics
- ✅ Simplicity: Two orthogonal concerns, not tangled
- ✅ Evolution: Extensible to future work types

---

## Recommendation: Approach C (Fundamental)

**Why this is the longest-term solution:**

### 1. Via Negativa Applied
- **Deletes conceptual complexity:** Don't conflate phase with reasoning
- **Minimal code:** 60 LOC vs 380 LOC (84% less)
- **No new modules:** Extend existing classifier

### 2. SCAS Alignment

**Simplicity:**
- Two clear concepts: "What work?" and "How deep to think?"
- Not tangled: Work type orthogonal to reasoning level

**Coherence:**
- Matches how we think: "This is cognitive work" vs "This is STRATEGIZE phase"
- Reuses existing reasoning_classifier
- Natural extension, not bolt-on

**Autonomy:**
- Autopilot can still infer work type from phase
- Explicit override: set `work_type` in metadata
- Agents request appropriate reasoning based on work type

**Speed:**
- Minimal runtime overhead (one additional check)
- No cascade of detectors

### 3. Extensibility

**Future work types:**
- `exploratory` - Research, prototyping (high reasoning, but not AFP cognitive)
- `maintenance` - Refactoring, cleanup (medium reasoning)
- `documentation` - Writing docs (medium reasoning, different model)
- `review` - Code review (high reasoning, critic-focused)

**Without touching phase detection:**
Just set `task.metadata.work_type = "exploratory"`

### 4. Proof It's Better

**Before (Approach A - Tactical):**
```typescript
// 380 LOC across 6 files
const phaseDetection = detectPhase(task, workspaceRoot);
if (phaseDetection.phase === 'STRATEGIZE') {
  return selectCognitiveModel(task);
}
```

**After (Approach C - Fundamental):**
```typescript
// 60 LOC total
const workType = task.metadata?.work_type || inferWorkType(task);
const reasoningLevel = selectReasoningForWorkType(workType, task);
return inferReasoningRequirement(task, context); // existing, just uses higher signal
```

**Difference:**
- 84% less code
- Clearer semantics
- More extensible
- Same functionality

---

## Implementation Plan (Approach C)

### Phase 1: Add work_type concept (30 LOC)

**File:** `tools/wvo_mcp/src/orchestrator/reasoning_classifier.ts`

```typescript
export type WorkType = 'cognitive' | 'implementation' | 'remediation' | 'observational';

function inferWorkType(task: Task): WorkType {
  // 1. Check explicit metadata (highest priority)
  if (task.metadata?.work_type) {
    return task.metadata.work_type as WorkType;
  }

  // 2. Infer from AFP phase
  const phase = task.metadata?.current_phase as string;
  if (phase) {
    if (['STRATEGIZE', 'SPEC', 'PLAN', 'THINK', 'GATE', 'REVIEW'].includes(phase)) {
      return 'cognitive';
    }
    if (['IMPLEMENT', 'VERIFY'].includes(phase)) {
      return 'implementation';
    }
  }

  // 3. Infer from title
  if (task.title.toUpperCase().includes('REMEDIATION')) {
    return 'remediation';
  }

  // 4. Default
  return 'implementation';
}

// Enhanced reasoning inference
export function inferReasoningRequirement(task: Task, context: AssembledContext): ReasoningDecision {
  // NEW: Work type is highest priority signal
  const workType = inferWorkType(task);

  if (workType === 'cognitive') {
    return {
      level: 'high',
      score: 2.0,
      confidence: 0.95,
      signals: [{ reason: `Cognitive work requires deep thinking`, weight: 2.0 }],
      override: 'metadata'
    };
  }

  if (workType === 'remediation') {
    return {
      level: 'low',
      score: 0.5,
      confidence: 0.90,
      signals: [{ reason: `Remediation work prioritizes speed`, weight: 0.5 }],
      override: 'metadata'
    };
  }

  // EXISTING: Continue with task-based inference for implementation work
  const override = extractMetadataOverride(task.metadata);
  // ... existing logic ...
}
```

### Phase 2: Add Claude extended thinking (30 LOC)

**File:** `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts`

```typescript
function buildClaudeRequest(task: Task, prompt: string, reasoningLevel: ReasoningLevel): ClaudeRequest {
  const thinkingBudget = getThinkingBudget(reasoningLevel);

  return {
    model: thinkingBudget > 0 ? 'claude-opus-4' : 'claude-sonnet-4.5',
    messages: [...],
    thinking: thinkingBudget > 0 ? {
      type: 'enabled',
      budget_tokens: thinkingBudget
    } : undefined
  };
}

function getThinkingBudget(reasoningLevel: ReasoningLevel): number {
  const budgets = {
    high: 12000,      // Cognitive work
    medium: 4000,     // Complex implementation
    low: 0,           // Standard implementation
    minimal: 0        // Observational/monitoring
  };
  return budgets[reasoningLevel] || 0;
}
```

### Phase 3: Update state_machine Task type (0 LOC)

**No schema change needed** - `task.metadata` already supports arbitrary fields

Just document the convention:
- `task.metadata.work_type`: 'cognitive' | 'implementation' | 'remediation' | 'observational'
- `task.metadata.current_phase`: AFP phase name (used to infer work_type if not explicit)

---

## Total: 60 LOC vs 380 LOC

**84% code reduction while achieving:**
- ✅ Same functionality (phase-aware routing)
- ✅ Extended thinking for Claude
- ✅ gpt-5-high for Codex cognitive work
- ✅ Better architecture (work type ≠ reasoning level)
- ✅ More extensible (new work types without code changes)
- ✅ Clearer semantics (what vs how deep)

**This is the longest-term AFP/SCAS solution.**
