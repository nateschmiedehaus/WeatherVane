# Unified Autopilot - Test Results & Required Improvements

**Date**: 2025-10-21
**Status**: ⚠️ NEEDS INTEGRATION

## Test Results Summary

### ✅ **Passing Tests** (6/11)

1. **Model Names in Compiled Code** ✓
   - All correct: `claude-sonnet-4.5`, `claude-haiku-4.5`, `gpt-5-codex-high/medium/low`

2. **Dry-Run Validation** ✓
   - Orchestrator spawning configured
   - Worker count correct (3 workers for 5 agents)
   - Critic spawning configured

3. **Roadmap Data** ✓
   - 25 pending tasks found
   - Phase 0 and Phase 1 tasks ready for execution

4. **SIGINT Handler** ✓
   - Graceful shutdown code present
   - Prevents state corruption on Ctrl+C

### ❌ **Failing Tests** (5/11)

1. **End-to-End Execution** ✗
   - Autopilot hangs during startup
   - No agent spawning output
   - No live telemetry displayed

2. **Runtime Issues** ✗
   - Script appears to hang indefinitely
   - No error messages or diagnostic output
   - Possible issue with Node.js embedded script or execa calls

---

## Critical Issues to Fix

### 1. **Autopilot Execution Hangs**

**Symptom**: Script starts but never produces output or spawns agents

**Possible Causes**:
- Embedded Node.js script in bash not executing properly
- execa() calls to `codex` or `claude` hanging
- Database initialization blocking
- MCP server path issues

**Investigation Needed**:
```bash
# Test Node.js script execution directly
node -e "console.log('Node works')"

# Test codex auth non-blocking
CODEX_HOME=.accounts/codex/codex_personal codex status

# Test StateMachine initialization
node -e "const {StateMachine} = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js'); const sm = new StateMachine(process.cwd()); console.log('SM created')"
```

---

## Required Context Management Integration

Based on the sophisticated `context_assembler.ts` system, the unified autopilot needs:

### **Memory & Project Management Features**

The previous system had excellent context assembly with:

1. **Task-Focused Context** (Currently Missing)
   - Related tasks (dependencies, parent, siblings)
   - Recent decisions relevant to the task area
   - Constraints that apply to this work
   - Recent learnings from similar tasks

2. **Quality Signals** (Currently Missing)
   - Quality issues in the task area
   - Overall quality trends per dimension
   - Recent failures/successes in related code

3. **Code Context** (Currently Missing)
   - Files agent needs to modify
   - Recent changes in the area
   - Code search integration

4. **Velocity Metrics** (Currently Missing)
   - Tasks completed today
   - Average task duration
   - Quality trend overall

5. **Research Insights** (Currently Missing)
   - Cached research highlights
   - Previous investigation results

### **What We Have Now (Simplified)**

The current `context_manager.ts` (lines 1-386) provides:
- Basic codebase overview (minimal/detailed/comprehensive)
- Quality standards (minimal/detailed/comprehensive)
- Architecture guidance based on task type
- Recent decisions from context.md
- Relevant docs by keyword matching

**Gap**: No integration with StateMachine, no quality metrics, no velocity tracking, no code search

---

## Integration Plan

### Phase 1: Restore Sophisticated Context Assembly

**Goal**: Integrate `ContextAssembler` features into `UnifiedOrchestrator`

**Changes Needed**:

1. **Update `buildPrompt()` in unified_orchestrator.ts**:
   ```typescript
   private buildPrompt(task: Task): string {
     // Use ContextAssembler instead of simple ContextManager
     const assembledContext = this.contextAssembler.assembleForTask(
       task.id,
       {
         includeCodeContext: true,
         includeQualityHistory: true,
         maxDecisions: 10,
         maxLearnings: 5,
         hoursBack: 24
       }
     );

     // Build prompt with:
     // - Task + related tasks
     // - Relevant decisions & constraints
     // - Quality issues in area
     // - Code files to modify
     // - Velocity metrics
     // - Agent persona & directives
   }
   ```

2. **Add Code Search Integration**:
   - Initialize `CodeSearchIndex` in constructor
   - Pass to ContextAssembler
   - Use for finding relevant files

3. **Add Quality Tracking**:
   - Pull quality metrics from StateMachine
   - Show trends to agents
   - Highlight areas needing attention

4. **Add Velocity Metrics**:
   - Calculate from StateMachine task history
   - Show agent how fast team is moving
   - Adjust complexity estimates

### Phase 2: Memory & Learning

**Goal**: Agents remember and learn from previous work

**Features**:
1. **Decision Memory**: Record architectural decisions, store in state/context.md
2. **Learning Log**: Capture "what worked" and "what didn't"
3. **Pattern Recognition**: Identify similar tasks, share solutions
4. **Quality Feedback Loop**: Failed critic reviews inform future prompts

### Phase 3: Project Management Intelligence

**Goal**: Smart task routing and prioritization

**Features**:
1. **Dependency Awareness**: Block tasks until dependencies complete
2. **Critical Path Detection**: Prioritize blocking tasks
3. **Resource Optimization**: Route complex tasks to best models
4. **Risk Detection**: Flag tasks that might fail based on history

---

## Next Steps

### Immediate (Fix Hanging Issue)

1. Debug why autopilot hangs
2. Add diagnostic logging to embedded Node script
3. Test StateMachine initialization independently
4. Verify execa calls don't block indefinitely

### Short-Term (Restore Context Assembly)

1. Replace simple ContextManager with sophisticated ContextAssembler
2. Integrate quality metrics and velocity tracking
3. Add code search for finding relevant files
4. Test with real Phase 0/1 tasks

### Medium-Term (Full Integration)

1. Implement decision memory and learning log
2. Add pattern recognition across tasks
3. Build project management intelligence layer
4. Validate with multi-day autopilot runs

---

## Comparison: Old vs New Context Systems

| Feature | Old (context_assembler.ts) | New (context_manager.ts) | Status |
|---------|---------------------------|--------------------------|--------|
| **Task-focused assembly** | ✓ Related tasks, dependencies | ✗ No StateMachine integration | ❌ Missing |
| **Quality signals** | ✓ Metrics, trends, issues | ✗ Static standards only | ❌ Missing |
| **Code context** | ✓ Files to modify, recent changes | ✗ Generic guidance only | ❌ Missing |
| **Velocity metrics** | ✓ Tasks/day, duration, quality | ✗ None | ❌ Missing |
| **Research cache** | ✓ Highlights from investigations | ✗ None | ❌ Missing |
| **Decision history** | ✓ From context entries | ✓ From context.md | ✅ Basic |
| **Dynamic complexity** | ✓ Based on task + history | ✓ Based on task keywords | ✅ Basic |
| **Architecture guidance** | ✓ API/UI/Model specific | ✓ API/UI/Model specific | ✅ Good |
| **Compact summaries** | ✓ Configurable lengths | ✗ Fixed lengths | ⚠️ Partial |

---

## Recommendations

1. **Priority 1**: Fix autopilot execution hang (BLOCKING)
2. **Priority 2**: Integrate ContextAssembler to restore sophisticated context
3. **Priority 3**: Add memory & learning features
4. **Priority 4**: Build project management intelligence

The unified autopilot has the right model assignments and Codex preference, but needs the sophisticated context management that made the previous system effective.

---

## Testing Checklist

Once fixes are applied:

- [ ] Autopilot runs without hanging
- [ ] Agents spawn with correct models
- [ ] Context includes quality metrics
- [ ] Context includes velocity data
- [ ] Context includes code file suggestions
- [ ] Agents reference decisions from memory
- [ ] Tasks complete successfully
- [ ] Ctrl+C shutdown works
- [ ] Multi-iteration runs stable
- [ ] Codex preferred for workers (2/3)

