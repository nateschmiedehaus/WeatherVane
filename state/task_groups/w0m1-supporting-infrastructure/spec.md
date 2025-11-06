# SPEC: w0m1-supporting-infrastructure

**Set ID:** w0m1-supporting-infrastructure
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Shared Libraries Operational

**Given:** Agent needs common utility (logging, file I/O, validation)
**When:** Agent imports from @wvo/libs
**Then:**
- Library exports typed interfaces
- Functions work correctly
- No errors thrown

**Test:**
```typescript
import { logger, fileIO, validate } from '@wvo/libs';

// Test logging
logger.info('Test message');
logger.error('Test error', new Error('sample'));

// Test file I/O
await fileIO.readJSON('state/roadmap.yaml');
await fileIO.writeJSON('test.json', { foo: 'bar' });

// Test validation
const result = validate.taskSchema({ id: 'test', title: 'Test' });
assert(result.valid === true);
```

**Success:** All imports work, all functions execute without errors

---

### AC2: MCP Adapter Operational

**Given:** Agent needs to call MCP tool
**When:** Agent uses MCP adapter
**Then:**
- Adapter provides typed interface
- Tool calls execute successfully
- Responses parsed correctly
- Errors handled gracefully

**Test:**
```typescript
import { mcpAdapter } from '@wvo/adapters';

// Test tool call
const result = await mcpAdapter.callTool('plan_next', { limit: 5 });
assert(result.tasks.length > 0);

// Test error handling
try {
  await mcpAdapter.callTool('nonexistent_tool', {});
  assert(false, 'Should have thrown');
} catch (err) {
  assert(err.code === 'TOOL_NOT_FOUND');
}
```

**Success:** Tool calls work, errors handled

---

### AC3: Roadmap Adapter Operational

**Given:** Agent needs to read/write roadmap
**When:** Agent uses roadmap adapter
**Then:**
- Can read tasks
- Can update task status
- Can add new tasks
- Changes persisted to state/roadmap.yaml

**Test:**
```typescript
import { roadmapAdapter } from '@wvo/adapters';

// Test read
const tasks = await roadmapAdapter.getTasks({ status: 'pending' });
assert(tasks.length > 0);

// Test update
await roadmapAdapter.updateTaskStatus('TEST-TASK-001', 'done');
const updated = await roadmapAdapter.getTask('TEST-TASK-001');
assert(updated.status === 'done');

// Test add
await roadmapAdapter.addTask({
  id: 'NEW-TASK',
  title: 'New Task',
  status: 'pending'
});
const added = await roadmapAdapter.getTask('NEW-TASK');
assert(added.id === 'NEW-TASK');
```

**Success:** All CRUD operations work

---

### AC4: Git Adapter Operational

**Given:** Agent needs to interact with git
**When:** Agent uses git adapter
**Then:**
- Can get git status
- Can stage files
- Can commit with message
- Can push to remote
- Errors handled (conflicts, auth failures)

**Test:**
```typescript
import { gitAdapter } from '@wvo/adapters';

// Test status
const status = await gitAdapter.getStatus();
assert(Array.isArray(status.modified));

// Test stage
await gitAdapter.stage(['test.txt']);

// Test commit
await gitAdapter.commit('Test commit message');

// Test push
await gitAdapter.push('origin', 'main');
```

**Success:** All git operations work

---

### AC5: Critic Adapter Operational

**Given:** Agent needs to run critic
**When:** Agent uses critic adapter
**Then:**
- Can run specific critic
- Results parsed correctly
- Blocking/warnings distinguished
- Error handling works

**Test:**
```typescript
import { criticAdapter } from '@wvo/adapters';

// Test run critic
const result = await criticAdapter.run('StrategyReviewer', {
  file: 'state/evidence/TASK-001/strategy.md'
});

assert(result.status === 'approved' || result.status === 'blocked');
if (result.status === 'blocked') {
  assert(Array.isArray(result.concerns));
}
```

**Success:** Critic runs, results valid

---

### AC6: Dynamic Prompt System Operational

**Given:** Agent needs context-aware prompt
**When:** Agent requests prompt from DPS
**Then:**
- Template selected based on role/task
- Context variables populated
- Prompt returned as string
- Versioning tracked

**Test:**
```typescript
import { dps } from '@wvo/dps';

// Test prompt generation
const prompt = await dps.getPrompt({
  role: 'implementer',
  taskType: 'feature',
  context: {
    taskId: 'AFP-TEST-001',
    files: ['src/foo.ts', 'src/bar.ts'],
    constraints: { maxLOC: 150 }
  }
});

assert(typeof prompt === 'string');
assert(prompt.includes('AFP-TEST-001')); // Context injected
assert(prompt.includes('150')); // Constraint injected
```

**Success:** Prompt generated with context

---

### AC7: Memory Core Operational

**Given:** Agent executing task
**When:** Agent reads/writes memory
**Then:**
- Working memory available (current task)
- Short-term memory available (recent 10 tasks)
- Long-term memory queryable (patterns)
- Memory persists between tasks

**Test:**
```typescript
import { memory } from '@wvo/memory';

// Test write working memory
await memory.setWorking('current-task', {
  taskId: 'AFP-TEST-001',
  phase: 'IMPLEMENT',
  context: { files: ['foo.ts'] }
});

// Test read working memory
const working = await memory.getWorking('current-task');
assert(working.taskId === 'AFP-TEST-001');

// Test short-term memory
const recent = await memory.getShortTerm({ limit: 5 });
assert(recent.length <= 5);

// Test long-term memory
await memory.storeLongTerm({
  pattern: 'file-edit',
  description: 'Prefer Edit over Write for existing files',
  examples: ['AFP-TASK-001', 'AFP-TASK-002']
});

const patterns = await memory.queryLongTerm({ category: 'file-operations' });
assert(patterns.length > 0);
```

**Success:** All memory operations work

---

## Functional Requirements

### FR1: Libraries Must Be Type-Safe
- All exports have TypeScript types
- No `any` types (strict mode)
- Compile-time errors for misuse
- IDE autocomplete works

### FR2: Adapters Must Isolate Dependencies
- External system changes don't affect agents
- Easy to mock for testing
- Consistent error handling
- Retry logic for transient failures

### FR3: DPS Must Support Multiple Roles/Tasks
- Template library extensible
- Context variables flexible (any JSON)
- Versioning tracks prompt changes
- Can compare prompt effectiveness

### FR4: Memory Must Be Queryable
- Filter by task, date, pattern
- Full-text search
- Aggregations (count, group by)
- Export for analysis

### FR5: Infrastructure Must Be Documented
- README for each component
- API documentation (JSDoc)
- Examples for common use cases
- Migration guide (if breaking changes)

---

## Non-Functional Requirements

### NFR1: Performance
- Library functions <1ms
- Adapter calls <100ms (excluding external system time)
- DPS prompt generation <50ms
- Memory queries <100ms

### NFR2: Reliability
- Graceful degradation (if external system down)
- Retry logic (exponential backoff)
- Error messages actionable
- Logging for debugging

### NFR3: Maintainability
- Unit tests (100% coverage for libs/adapters)
- Integration tests (end-to-end)
- Minimal dependencies
- Clear separation of concerns

### NFR4: Extensibility
- Easy to add new utilities
- Easy to add new adapters
- Easy to add new prompt templates
- Easy to add new memory categories

---

## Exit Criteria

**Set complete when ALL criteria met:**

- [x] AC1: Shared libraries operational (logging, file I/O, validation)
- [x] AC2: MCP adapter operational (tool calls work)
- [x] AC3: Roadmap adapter operational (CRUD operations)
- [x] AC4: Git adapter operational (status, stage, commit, push)
- [x] AC5: Critic adapter operational (run critics, parse results)
- [x] AC6: DPS operational (prompt generation with context)
- [x] AC7: Memory operational (working/short-term/long-term)

**Quality gates:**
- [ ] Unit tests pass (100% coverage for libs)
- [ ] Integration tests pass (adapters + external systems)
- [ ] Performance benchmarks met (<100ms for adapters)
- [ ] Documentation complete (README + JSDoc)

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md (execution approach)
**Owner:** Claude Council
