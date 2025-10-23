# ContextAssembler Integration - Complete

Dynamic, intelligent documentation injection for autonomous agents.

---

## Overview

The ContextAssembler has been enhanced with intelligent agent library documentation injection. Agents now receive **only the documentation they need** based on:
1. **Agent role** (Worker, Critic, Atlas, Director Dana)
2. **Task domain** (Product, ML, Infrastructure, Security)
3. **Task complexity** and type
4. **Task keywords** (test, security, model, etc.)

This ensures agents get relevant, focused documentation without overwhelming context bloat.

---

## Implementation Details

### 1. Type Additions

**File**: `tools/wvo_mcp/src/orchestrator/context_assembler.ts`

**New types**:
```typescript
export type AgentRole = 'worker' | 'critic' | 'atlas' | 'director_dana';
export type TaskDomain = 'product' | 'ml' | 'infrastructure' | 'security' | 'general';

export interface AssembledContext {
  // ... existing fields
  agentLibraryDocs?: string[];  // NEW: Relevant doc paths
}
```

---

### 2. Core Methods

#### `getAgentLibraryDocs(task, agentRole?): Promise<string[]>`

**Purpose**: Intelligently select relevant agent library docs

**Algorithm**:
```
1. Infer agent role (from metadata or task type)
2. Infer task domain (from metadata or keywords)
3. Add common standards (all agents)
   - quality_standards.md
   - verification_loop.md
4. Add role-specific charter
   - workers/charter.md (for workers)
   - critics/charter.md (for critics)
   - etc.
5. Add common concepts/processes based on task complexity
   - escalation_protocol.md (if complexity >= 5)
   - task_lifecycle.md (if epic/milestone)
   - critic_workflow.md (if critic)
6. Add domain-specific guides
   - domains/{domain}/overview.md
   - Plus specific guides based on keywords
7. Add testing/security standards if applicable
8. Deduplicate and limit to 8 docs max
```

**Example output** (ML model training task):
```typescript
[
  'docs/agent_library/common/standards/quality_standards.md',
  'docs/agent_library/common/standards/verification_loop.md',
  'docs/agent_library/roles/workers/charter.md',
  'docs/agent_library/domains/ml/overview.md',
  'docs/agent_library/domains/ml/modeling_standards.md',
  'docs/agent_library/domains/ml/data_quality.md',
  'docs/agent_library/common/standards/testing_standards.md'
]
```

---

#### `inferAgentRole(task): AgentRole`

**Purpose**: Determine agent's role

**Logic**:
1. Check `task.metadata.agentRole` (explicit)
2. If task type is 'epic' or 'milestone' → Atlas
3. Default → Worker

**Example**:
```typescript
const task = {
  id: 'T1.1.1',
  title: 'Implement weather cache',
  type: 'task',
  metadata: { agentRole: 'worker' }
};

inferAgentRole(task);  // → 'worker'
```

---

#### `inferTaskDomain(task): TaskDomain`

**Purpose**: Determine task's domain

**Logic**:
1. Check `task.metadata.domain` (explicit)
2. Scan task title/description for keywords:
   - **ML**: model, training, mmm, bayesian, causal, data quality
   - **Infrastructure**: mcp, orchestrator, autopilot, telemetry
   - **Security**: security, auth, secret, audit, threat
   - **Product**: weather, demo, ux, dashboard, frontend
3. Default → 'general'

**Example**:
```typescript
const task = {
  id: 'T1.2.3',
  title: 'Train MMM model with weather features',
  description: 'Implement Bayesian MMM for causal inference'
};

inferTaskDomain(task);  // → 'ml'
```

---

### 3. Integration Points

**Modified**: `assembleForTask()` method

**Changes**:
```typescript
// Added to parallel context assembly
const settled = await Promise.allSettled([
  // ... existing calls
  this.getAgentLibraryDocs(task)  // NEW
]);

// Added to destructuring
const [
  // ... existing fields
  agentLibraryDocs
] = settled.map(...);

// Added to assembled context
const assembled: AssembledContext = {
  // ... existing fields
  agentLibraryDocs: agentLibraryDocs || undefined
};
```

---

**Modified**: `formatForPrompt()` method

**Changes**:
```typescript
// Added section in prompt output
if (context.agentLibraryDocs && context.agentLibraryDocs.length > 0) {
  const lines = context.agentLibraryDocs
    .map(docPath => `- ${docPath}`)
    .join('\n');
  sections.push(`## Agent Library Documentation\n${lines}\n*Use fs_read to review relevant standards, charters, and guides*`);
}
```

---

## Example: Task Context Assembly

**Task**:
```yaml
id: T13.1.4
title: Validate data quality before MMM training
description: Run data quality checks on synthetic tenant data
type: task
metadata:
  domain: ml
  agentRole: worker
estimated_complexity: 6
```

**Agent library docs injected**:
```
1. docs/agent_library/common/standards/quality_standards.md
2. docs/agent_library/common/standards/verification_loop.md
3. docs/agent_library/roles/workers/charter.md
4. docs/agent_library/common/concepts/escalation_protocol.md (complexity >= 5)
5. docs/agent_library/domains/ml/overview.md
6. docs/agent_library/domains/ml/data_quality.md (keyword: "data quality")
7. docs/agent_library/common/standards/testing_standards.md (implied for validation)
```

**Prompt output**:
```markdown
## Agent Library Documentation
- docs/agent_library/common/standards/quality_standards.md
- docs/agent_library/common/standards/verification_loop.md
- docs/agent_library/roles/workers/charter.md
- docs/agent_library/common/concepts/escalation_protocol.md
- docs/agent_library/domains/ml/overview.md
- docs/agent_library/domains/ml/data_quality.md
- docs/agent_library/common/standards/testing_standards.md

*Use fs_read to review relevant standards, charters, and guides*
```

---

## Agent Workflow

**Before implementation**:
```
Agent → Task → Code files → Start work (no standards reference)
```

**After implementation**:
```
Agent → Task → Code files + Agent library docs
        ↓
      fs_read quality_standards.md (understand 85-95% threshold)
        ↓
      fs_read data_quality.md (learn completeness, validity checks)
        ↓
      fs_read verification_loop.md (understand build → test → audit flow)
        ↓
      Implement with standards awareness
```

---

## Benefits

### 1. Self-Service Learning

Agents can **autonomously learn** relevant standards without human intervention:
- Worker reads workers/charter.md to understand autonomy bounds
- Critic reads critic_workflow.md to understand OODA loop
- All agents reference quality_standards.md for 7-dimension framework

### 2. Context Efficiency

Only **8 docs max** injected (vs. 35 total in library):
- Reduces token usage
- Focuses agent attention
- Prevents information overload

### 3. Dynamic Adaptation

Documentation updates **automatically propagate**:
- Update `data_quality.md` → All ML tasks get new guidance
- Add new domain → Inference logic auto-detects
- No manual prompt engineering required

### 4. Consistency

All agents follow **same standards**:
- 85-95% quality threshold
- 5-step verification loop
- Escalation protocol SLAs
- Essential 7 test dimensions

---

## Testing Checklist

**Unit tests** (to be implemented):
```typescript
describe('ContextAssembler - Agent Library Integration', () => {
  it('infers worker role for standard tasks', () => {
    const task = { id: 'T1', type: 'task', title: 'Implement feature' };
    expect(inferAgentRole(task)).toBe('worker');
  });

  it('infers atlas role for epics', () => {
    const task = { id: 'E1', type: 'epic', title: 'Weather integration' };
    expect(inferAgentRole(task)).toBe('atlas');
  });

  it('infers ml domain from keywords', () => {
    const task = { id: 'T1', title: 'Train MMM model' };
    expect(inferTaskDomain(task)).toBe('ml');
  });

  it('includes common standards for all agents', async () => {
    const task = { id: 'T1', title: 'Any task' };
    const docs = await getAgentLibraryDocs(task);
    expect(docs).toContain('docs/agent_library/common/standards/quality_standards.md');
  });

  it('includes domain-specific guides for ML tasks', async () => {
    const task = { id: 'T1', title: 'Train model', domain: 'ml' };
    const docs = await getAgentLibraryDocs(task);
    expect(docs).toContain('docs/agent_library/domains/ml/overview.md');
  });

  it('limits to max 8 docs', async () => {
    const task = {
      id: 'T1',
      title: 'Complex security ML infrastructure testing task',
      estimated_complexity: 8
    };
    const docs = await getAgentLibraryDocs(task);
    expect(docs.length).toBeLessThanOrEqual(8);
  });
});
```

---

## Integration Tests

**Test agent context injection** (manual verification):

```bash
# 1. Create test task with ML domain
sqlite3 state/state.db "INSERT INTO tasks (id, title, description, status, type, metadata) VALUES ('T_TEST_ML', 'Train MMM model', 'Implement Bayesian regression', 'pending', 'task', '{\"domain\": \"ml\"}');"

# 2. Assemble context
node -e "
const { ContextAssembler } = require('./tools/wvo_mcp/dist/orchestrator/context_assembler.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');

const sm = new StateMachine('./state/state.db');
const assembler = new ContextAssembler(sm, process.cwd());

assembler.assembleForTask('T_TEST_ML').then(context => {
  console.log('Agent Library Docs:', context.agentLibraryDocs);
  console.log('\nFormatted Prompt:\n', assembler.formatForPrompt(context));
});
"

# Expected output should include:
# - docs/agent_library/common/standards/quality_standards.md
# - docs/agent_library/domains/ml/overview.md
# - docs/agent_library/domains/ml/modeling_standards.md
```

---

## Metrics

**Token efficiency**:
- Average doc paths: ~60 chars each
- 8 docs × 60 chars = 480 chars
- Plus section header (~100 chars)
- **Total overhead**: ~600 chars (~150 tokens)
- **vs. dumping full docs**: 35 files × 5000 chars = 175,000 chars (43,750 tokens)
- **Savings**: 99.6% reduction

**Coverage**:
- 35 agent library docs created
- 4 agent roles supported
- 4 task domains supported
- 100% automated doc selection

---

## Future Enhancements

### 1. Doc Fragment Injection

Instead of full paths, inject **relevant snippets**:
```typescript
// Current: Just paths
agentLibraryDocs: ['docs/agent_library/common/standards/quality_standards.md']

// Future: Include key snippets
agentLibraryDocs: [
  {
    path: 'docs/agent_library/common/standards/quality_standards.md',
    snippet: '## 7 Quality Dimensions\n1. Code Elegance (85-95%)\n2. Architecture...'
  }
]
```

### 2. Learning Feedback Loop

Track which docs agents **actually read**:
```typescript
// Log doc access
logDocAccess({
  taskId: 'T1.1.1',
  docPath: 'docs/agent_library/domains/ml/data_quality.md',
  timestamp: Date.now()
});

// Adjust recommendations based on usage
// If agents never read a doc, stop recommending it
```

### 3. Cross-Domain Tasks

Support **multi-domain** tasks:
```typescript
// Task involves both ML and security
const task = {
  id: 'T1',
  title: 'Secure model serving with encrypted predictions',
  metadata: { domains: ['ml', 'security'] }  // Multiple domains
};

// Include guides from both domains
```

---

## Key Documents

- [Agent Library Index](/docs/agent_library/index.md)
- [ContextAssembler Source](/tools/wvo_mcp/src/orchestrator/context_assembler.ts)
- [Agent Library Status](/docs/AGENT_LIBRARY_STATUS.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
**Status**: ✅ **COMPLETE**
