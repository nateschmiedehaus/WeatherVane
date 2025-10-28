# Critical Process Gap Analysis
## The Disconnect Between Documentation and Execution

### The Smoking Gun

**WorkProcessEnforcer is initialized but NEVER USED:**

```typescript
// orchestrator_loop.ts line 415:
this.workProcessEnforcer = new WorkProcessEnforcer(stateMachine, workspaceRoot);
// ^^^ Created but never called!
```

**Search results:**
- `grep "workProcessEnforcer\."` returns NOTHING
- The enforcer has methods like `enforcePhaseSequence()` but they're never invoked
- It's like having a security guard who's hired but never asked to check badges

### Why Agents Skip the Process

1. **No Automatic Enforcement**
   - WorkProcessEnforcer exists but doesn't hook into the execution
   - State transitions happen without phase validation
   - Agents can jump directly to IMPLEMENT

2. **System Prompt Too Passive**
   ```markdown
   # Current (passive mention):
   "Contents of /path/to/CLAUDE.md (project instructions)"

   # What's needed (active enforcement):
   "MANDATORY: You MUST follow STRATEGIZE→MONITOR process
    VIOLATION = TASK FAILURE
    Skip any stage = IMMEDIATE REJECTION"
   ```

3. **No Pre-Flight Checks**
   - When a task starts, nothing forces STRATEGIZE first
   - No validation that previous phases completed
   - No rejection when phases are skipped

### The Fix Required

#### Option 1: Hook Enforcer into State Machine (Correct Solution)
```typescript
// In orchestrator_loop.ts executeTick():
async executeTick(): Promise<void> {
  // BEFORE any action:
  if (this.workProcessEnforcer) {
    const phase = this.workProcessEnforcer.getCurrentPhase(task.id);
    if (!phase || phase !== 'STRATEGIZE') {
      throw new Error('MUST start with STRATEGIZE phase');
    }

    // Validate phase transition
    const canTransition = await this.workProcessEnforcer.validateTransition(
      currentPhase,
      nextPhase,
      task.id
    );

    if (!canTransition.valid) {
      throw new Error(`Cannot skip from ${currentPhase} to ${nextPhase}: ${canTransition.errors.join(', ')}`);
    }
  }
}
```

#### Option 2: Agent Prompt Injection (Workaround)
```markdown
# Add to EVERY agent prompt:
CRITICAL PROCESS REQUIREMENT:
1. Current Phase: ${currentPhase}
2. Next Required: ${nextPhase}
3. You CANNOT proceed unless ${currentPhase} is complete
4. If you try to skip, the task will be REJECTED
```

#### Option 3: MCP Tool Gatekeeping (Enforcement Layer)
```typescript
// Before any tool execution:
if (tool.requiresPhase && currentPhase !== tool.requiresPhase) {
  return {
    error: `Tool ${tool.name} requires ${tool.requiresPhase} phase. Currently in ${currentPhase}.`
  };
}
```

### Why This Matters

**Without enforcement:**
- Agents naturally skip to coding (IMPLEMENT)
- No quality gates are checked
- "Completion" happens without verification
- We get false claims like "99.4% done" when it's 98.7%

**With enforcement:**
- Forced to STRATEGIZE first (understand the problem)
- Must SPEC before PLAN (define success)
- Cannot claim done without VERIFY
- MONITOR ensures it stays working

### Immediate Action Required

1. **Connect the WorkProcessEnforcer** to actual execution
2. **Update system prompts** to be prescriptive, not descriptive
3. **Add phase validation** to state transitions
4. **Create tool-level enforcement** for phase requirements

### Evidence This Is The Problem

When you said "I don't see codex or claude do it unless I force it" - this is EXACTLY why. The process exists in documentation and code, but there's no mechanism making agents follow it.

It's like having:
- Traffic laws (CLAUDE.md)
- Traffic lights (WorkProcessEnforcer)
- But the lights aren't connected to power (never called)
- And there are no police (no enforcement)

So everyone just drives through the intersection however they want.