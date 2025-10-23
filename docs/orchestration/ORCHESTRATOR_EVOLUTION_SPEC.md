# Orchestrator Evolution - Autonomous Business Priority Execution

**Date**: 2025-10-23
**Priority**: P0 - Blocks autonomous operation
**Owner**: Autopilot (self-improvement task)

---

## Problem Statement

**Current orchestrator behavior**:
- Waits for explicit task lists and instructions
- Doesn't autonomously assess "is this ready to execute?"
- Doesn't connect technical readiness → business impact → priority
- Creates documents instead of recognizing when to act
- Needs human intervention to recognize obvious next steps

**Example failure case** (Today):
1. Task T-MLR-1.2 exists in roadmap: "Generate synthetic data for 20 tenants"
2. Infrastructure is ready (generation framework exists, 2 examples done)
3. Business impact clear (blocks demo → blocks revenue)
4. Technical blockers: NONE
5. Orchestrator response: Created 3 documents, didn't execute task
6. **Expected**: Orchestrator recognizes readiness and executes autonomously

---

## ✅ IMPLEMENTED: Multi-Disciplinary Decision Framework (2025-10-23)

**Status**: Code complete, ready for orchestrator integration

### New Modules (Ready)
1. **`seven_lens_evaluator.ts`** - Evaluates tasks through 7 expert perspectives (CEO, Designer, UX, CMO, Ad Expert, Academic, PM)
2. **`milestone_review_generator.ts`** - Auto-generates 7 review tasks when milestones reach 80% completion

### 7-Lens Decision Framework
**Every task must pass ALL 7 expert lenses to be "ready to execute":**

1. **CEO** - Does this unblock revenue? Highest-ROI use of time?
2. **Designer** - World-class visual/brand standards (Vercel/Linear/Stripe quality)?
3. **UX** - Frictionless (<5 min to value), no training required?
4. **CMO** - Supports GTM narrative ("capture 15-30% more revenue via weather timing")?
5. **Ad Expert** - Technically feasible within platform constraints (API limits)?
6. **Academic** - Statistically valid (R²≥0.65, p<0.05), reproducible?
7. **PM** - Critical path impact? Dependencies clear? Exit criteria defined?

**Decision Rule**: Task passes only if score ≥70 on EACH lens.

### Usage
```typescript
import { SevenLensEvaluator } from './orchestrator/seven_lens_evaluator.js';

const evaluator = new SevenLensEvaluator();
const report = evaluator.evaluateTask(task, context);

if (report.readyToExecute) {
  // All 7 lenses pass → Execute immediately
  executeTask(task);
} else {
  // Failed lenses → Document concerns, refine task
  logger.info(`Task ${task.id} not ready: ${report.blockers.join(', ')}`);
  refineTask(task, report.lenses);
}
```

### Milestone Review Auto-Generation
**Trigger**: When milestone completion ≥80%, auto-generate 7 review tasks:
1. Technical Review (build, tests, features)
2. Quality Review (critics, security, performance)
3. Business Review (CEO lens)
4. UX Review (frictionless, <5min to value)
5. Academic Review (statistical rigor)
6. Risk Review (lessons learned)
7. Go/No-Go Decision (all lenses pass → proceed)

```typescript
import { MilestoneReviewGenerator } from './orchestrator/milestone_review_generator.js';

const generator = new MilestoneReviewGenerator();
const result = await generator.checkAndGenerateReviews();
// { generated: 7, milestones: ['T-MLR-1'] }
```

### Integration TODO
- [ ] Add `SevenLensEvaluator` to orchestrator runtime (before task execution)
- [ ] Add `MilestoneReviewGenerator` to periodic orchestrator checks (every iteration)
- [ ] Update context.md loaded in orchestrator with multi-disciplinary objectives
- [ ] Test with T-MLR-1.2 (synthetic data task) - should pass CEO, PM lenses (high revenue impact, clear exit criteria)

---

## Required Orchestrator Capabilities

### 1. Readiness Assessment
**Orchestrator should autonomously evaluate**:
```python
def task_ready_to_execute(task_id: str) -> bool:
    """Assess if task has no blockers and can start immediately."""
    return (
        infrastructure_exists(task_id) and
        not has_technical_blockers(task_id) and
        dependencies_satisfied(task_id) and
        resources_available(task_id)
    )
```

**For each roadmap task, check**:
- ✅ Does infrastructure/code exist? (read codebase, check imports)
- ✅ Are dependencies done? (check task.dependencies)
- ✅ Are there technical blockers? (API keys missing, services down, etc.)
- ✅ Are resources available? (disk space, compute, credentials)

**If all true → Task is executable NOW**

### 2. Business Impact Scoring
**Orchestrator should autonomously calculate**:
```python
def business_impact_score(task_id: str) -> float:
    """Calculate business value (0-100 scale)."""
    score = 0.0

    # Revenue path impact (highest priority)
    if blocks_revenue_generation(task_id):
        score += 50.0

    # Demo/customer readiness
    if blocks_demo_readiness(task_id):
        score += 30.0

    # Unblocks other high-value work
    if unblocks_n_tasks(task_id) > 3:
        score += 10.0

    # User explicitly mentioned
    if in_recent_user_feedback(task_id):
        score += 10.0

    return score
```

**Business priority keywords to detect**:
- "demo readiness", "show to prospects", "customer-facing"
- "blocks revenue", "paying customers", "close deals"
- "production", "launch", "ship"
- "user explicitly requested", "mentioned multiple times"

**Depriororitize**:
- "nice to have", "polish", "optimization"
- "infrastructure", "refactor", "cleanup"
- "tests" (unless blocking deploy)

### 3. Autonomous Execution Decision
**Orchestrator should make this decision autonomously**:
```python
def should_execute_now(task_id: str) -> tuple[bool, str]:
    """Decide if task should execute immediately without human approval."""

    ready = task_ready_to_execute(task_id)
    impact = business_impact_score(task_id)

    if not ready:
        return (False, f"Technical blockers exist: {get_blockers(task_id)}")

    if impact >= 50:  # High business value
        return (True, f"High business impact ({impact}), infrastructure ready, executing autonomously")

    if impact >= 30 and mentioned_by_user_recently(task_id):
        return (True, f"User priority ({impact}), executing autonomously")

    return (False, f"Lower priority ({impact}), awaiting explicit instruction")
```

**When score ≥50: Execute immediately without asking**
**When score 30-49: Execute if user mentioned recently**
**When score <30: Wait for explicit instruction**

### 4. Self-Recognition of Document Loops
**Orchestrator should detect when it's spinning**:
```python
def detect_document_loop() -> bool:
    """Check if we're making documents instead of acting."""
    recent_actions = get_last_n_actions(10)

    document_actions = [a for a in recent_actions if a.type in ['Write', 'TodoWrite', 'context_write']]
    execution_actions = [a for a in recent_actions if a.type in ['plan_update', 'cmd_run', 'agent_launch']]

    # If 80%+ of recent actions are documentation, and task is ready, we're looping
    if len(document_actions) / len(recent_actions) > 0.8:
        if any(task_ready_to_execute(t) for t in get_high_priority_tasks()):
            return True  # STOP DOCUMENTING, START EXECUTING

    return False
```

**When detected**:
- Log warning: "Document loop detected, switching to execution mode"
- Force transition to execution of highest-ready task
- Skip further documentation until task starts

### 5. Task Refinement and Decomposition
**Orchestrator should autonomously improve task structure**:
```python
def evaluate_task_quality(task: Task) -> tuple[float, list[str]]:
    """Score task quality (0-100) and identify issues."""
    score = 100.0
    issues = []

    # Too vague or large
    if task.estimated_hours > 16:
        score -= 20
        issues.append("Task too large, needs decomposition")

    # Missing clear deliverables
    if not task.exit_criteria or len(task.exit_criteria) == 0:
        score -= 20
        issues.append("No exit criteria defined")

    # Business value unclear
    if not mentions_business_objective(task.description):
        score -= 15
        issues.append("Business value not articulated")

    # Missing intermediate steps
    if needs_decomposition(task) and not has_subtasks(task):
        score -= 15
        issues.append("Missing intermediate steps")

    # Not aligned with main objectives
    if not aligned_with_program_goals(task):
        score -= 30
        issues.append("Misaligned with main program objectives")

    return (score, issues)

def refine_task_autonomously(task: Task) -> Task:
    """Rewrite task to be better structured and aligned."""

    # Decompose if too large
    if task.estimated_hours > 16:
        subtasks = decompose_into_subtasks(task)
        task.subtasks = subtasks
        task.description += f"\n\nDecomposed into {len(subtasks)} subtasks"

    # Add exit criteria if missing
    if not task.exit_criteria:
        task.exit_criteria = infer_exit_criteria(task)

    # Reorient to business objectives if misaligned
    if not aligned_with_program_goals(task):
        task.description = reframe_with_business_context(task)
        task.priority = recalculate_priority_vs_objectives(task)

    # Add intermediate steps if missing
    if needs_decomposition(task) and not has_subtasks(task):
        task.subtasks = generate_implementation_steps(task)

    return task
```

**Main program objectives** (for alignment check):
1. **Get to paying customers** - Demo works → Show prospects → Close deals
2. **Prove weather impact** - Models show quantifiable weather lift
3. **Real data ingestion** - Connect live data sources
4. **Autonomous operation** - Reduce human intervention

### 6. Intelligent Model Selection
**Orchestrator should autonomously choose appropriate model tier**:
```python
def select_model_for_task(task: Task) -> tuple[str, str]:
    """Choose model tier based on task complexity and requirements."""

    # High complexity: strategic decisions, architecture, multi-step reasoning
    if task.requires_deep_reasoning():
        return ("codex", "high")  # Codex o1-high or equivalent

    # Architectural work: system design, refactoring, integration
    if task.is_architectural():
        return ("claude", "sonnet")  # Claude Sonnet for code understanding

    # Complex implementation: multi-file changes, new features
    if task.estimated_hours > 8 or task.touches_multiple_systems():
        return ("claude", "sonnet")  # Sonnet for complex implementation

    # Standard implementation: single-file, well-defined
    if task.estimated_hours <= 8 and task.has_clear_spec():
        return ("claude", "haiku")  # Haiku for standard work

    # Quick tasks: tests, documentation, minor fixes
    if task.estimated_hours <= 2:
        return ("claude", "haiku")  # Haiku for quick tasks

    # Default to medium capability
    return ("claude", "haiku")

def task_requires_deep_reasoning(task: Task) -> bool:
    """Check if task needs strategic/architectural thinking."""
    keywords = [
        "design", "architecture", "strategy", "refactor",
        "orchestrator", "autonomous", "decision-making",
        "multi-step", "complex reasoning", "system design"
    ]
    return any(kw in task.description.lower() for kw in keywords)
```

**Model selection principles**:
- **Don't default to cheap models for complex work** - Use high/sonnet when needed
- **Task complexity determines tier** - Not just cost optimization
- **Strategic work deserves strategic models** - Self-improvement uses best available
- **Clear specs can use efficient models** - Well-defined tasks → Haiku is fine
- **When in doubt, use more capable model** - Better to overspend than fail

**User guidance** (2025-10-23):
> "if tasks require codex high and sonnet, it's ok to use the better models rather than just medium and haiku"

Translation: Don't be stingy with model tier. Complex/strategic work justifies premium models.

**Task refinement triggers**:
- Quality score <70 → Rewrite task
- Task blocked >24 hours → Decompose differently
- User feedback mentions task → Realign with user intent
- Dependency chain >5 deep → Flatten hierarchy

**Example refinement**:
```
BEFORE: "Implement incrementality framework"
Issues: Vague, no exit criteria, unclear business value

AFTER: "Generate synthetic geo-holdout experiment data for demo validation"
Why: Aligned with "prove weather impact" objective
Deliverables:
  - 2 treatment geos, 2 control geos
  - 30-day experiment window
  - Measurable lift metric
  - Visual for demo (chart/table)
Estimated: 4-8 hours (was 16+)
Business value: Enables demo claim "18% validated lift"
```

---

## Implementation Requirements

### Phase 1: Readiness Assessment (4-8 hours)
**Add to orchestrator runtime**:
- `InfrastructureAnalyzer` - Scans codebase for task infrastructure
  - Checks imports, file existence, function definitions
  - Validates dependencies are installed
  - Checks for API keys/credentials if needed

- `BlockerDetector` - Identifies technical blockers
  - Missing files/modules
  - Unresolved dependencies
  - Service availability
  - Resource constraints (disk, memory)

- `ReadinessScorer` - Combines signals into go/no-go decision
  - Infrastructure: 0-25 points
  - Dependencies: 0-25 points
  - Resources: 0-25 points
  - No blockers: 0-25 points
  - **Score ≥80 = Ready to execute**

### Phase 2: Business Impact Scoring (4-8 hours)
**Add to orchestrator runtime**:
- `BusinessValueAnalyzer` - Calculates impact score
  - Parses task descriptions for revenue keywords
  - Analyzes dependency graph (what does this unblock?)
  - Checks user feedback/context for mentions
  - Generates 0-100 business value score

- `PriorityQueue` - Orders tasks by composite score
  - `composite_score = readiness * 0.5 + business_value * 0.5`
  - Higher score = execute first
  - Updates dynamically as context changes

### Phase 3: Autonomous Execution Mode (8-16 hours)
**Add to orchestrator main loop**:
```typescript
async function autonomousOrchestrationLoop() {
  while (true) {
    // Get highest priority ready task
    const nextTask = await priorityQueue.getHighestReady();

    if (!nextTask) {
      // No ready tasks, wait for new information
      await sleep(60000);
      continue;
    }

    // Check if we should execute autonomously
    const [shouldExecute, reason] = shouldExecuteNow(nextTask.id);

    if (shouldExecute) {
      logger.info(`Autonomous execution: ${nextTask.id} - ${reason}`);
      await executeTask(nextTask);
    } else {
      logger.info(`Awaiting approval: ${nextTask.id} - ${reason}`);
      await requestHumanApproval(nextTask);
    }
  }
}
```

**Key capabilities**:
- Runs continuously, no human in the loop for high-priority tasks
- Documents decision reasoning for audit
- Escalates to human only when:
  - Readiness score <80 (technical uncertainty)
  - Business value <30 (low impact, user should decide)
  - Risk flags present (destructive operations, production changes)

### Phase 4: Self-Monitoring and Loop Detection (4-8 hours)
**Add watchdogs**:
- `DocumentLoopDetector` - Catches spinning behavior
  - Tracks action types over time
  - Detects high documentation / low execution ratio
  - Forces mode switch when detected

- `ProgressMonitor` - Ensures forward movement
  - Tracks tasks completed per hour
  - Alerts if completion rate drops below threshold
  - Escalates to human if stuck for >2 hours

### Phase 5: Task Refinement and Decomposition (8-16 hours)
**Model recommendation**: Use Sonnet or Codex high - this is strategic/architectural work
**Add to orchestrator runtime**:
- `TaskQualityEvaluator` - Scores task structure (0-100)
  - Checks for clear deliverables
  - Validates business alignment
  - Detects missing decomposition
  - Identifies vague/oversized tasks

- `TaskDecomposer` - Breaks large tasks into subtasks
  - Analyzes task scope and estimated hours
  - Generates intermediate steps
  - Creates dependency chains
  - Ensures each subtask is <8 hours

- `BusinessAlignmentChecker` - Validates against program objectives
  - Main objectives: Get customers, prove weather impact, real data, autonomous ops
  - Scores alignment (0-100)
  - Rewrites task description with business context
  - Recalculates priority based on objective contribution

- `TaskRefiner` - Autonomous rewriting system
  - Runs quality evaluation on all tasks periodically
  - Identifies tasks with score <70
  - Rewrites task with better structure
  - Updates roadmap autonomously
  - Logs refinement reasoning for audit

**Refinement loop**:
```typescript
async function autonomousTaskRefinement() {
  const allTasks = await getRoadmapTasks();

  for (const task of allTasks) {
    const [score, issues] = evaluateTaskQuality(task);

    if (score < 70) {
      logger.info(`Task ${task.id} quality=${score}, refining: ${issues}`);
      const refinedTask = await refineTaskAutonomously(task);
      await updateRoadmap(task.id, refinedTask);

      // Document what changed and why
      await recordRefinement({
        taskId: task.id,
        oldDescription: task.description,
        newDescription: refinedTask.description,
        issues: issues,
        alignmentScore: scoreBusinessAlignment(refinedTask)
      });
    }
  }
}
```

**Run refinement**:
- Every 24 hours (periodic cleanup)
- When task blocked >24 hours (stuck = bad decomposition)
- When user feedback mentions task (realign to user intent)
- Before starting task (ensure it's well-defined)

---

## Success Criteria

### Behavioral Tests
1. **Autonomous recognition**: Given T-MLR-1.2 with ready infrastructure, orchestrator executes within 1 iteration (no documents first)
2. **Priority ordering**: Given 5 tasks with different business impacts, executes in correct order
3. **Blocker detection**: Given task with missing dependency, correctly identifies blocker and escalates
4. **Loop prevention**: Given 5 consecutive document actions with ready task, switches to execution mode
5. **User priority**: Given user mentions task 3 times, elevates priority above roadmap order
6. **Task decomposition**: Given task estimated >16 hours with vague description, autonomously breaks into <8 hour subtasks
7. **Business realignment**: Given task with no business objective stated, rewrites with business context
8. **Quality enforcement**: Given 10 tasks in roadmap, identifies and refines all with quality score <70

### Metrics
- **Time to execution**: <1 hour from task-becomes-ready to execution-starts (for high-priority)
- **Document-to-execution ratio**: <0.3 (most actions should be execution, not documentation)
- **Autonomous completion rate**: ≥80% of ready high-priority tasks execute without human intervention
- **False positive rate**: <5% of autonomous decisions need human override

---

## Integration Points

### Existing Systems to Enhance
1. **`tools/wvo_mcp/src/orchestrator/priority_scheduler.ts`** - Add business impact scoring
2. **`tools/wvo_mcp/src/orchestrator/task_characteristics.ts`** - Add readiness assessment
3. **`tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`** - Add autonomous execution loop
4. **`tools/wvo_mcp/src/orchestrator/context_assembler.ts`** - Add business context extraction
5. **`tools/wvo_mcp/src/orchestrator/blocker_escalation_manager.ts`** - Use for blocker detection

### New Modules to Create
1. **`infrastructure_analyzer.ts`** - Codebase readiness scanning
2. **`business_value_analyzer.ts`** - Impact scoring from context
3. **`autonomous_executor.ts`** - Self-directed task execution
4. **`document_loop_detector.ts`** - Anti-spinning watchdog
5. **`task_quality_evaluator.ts`** - Task structure scoring
6. **`task_decomposer.ts`** - Break large tasks into subtasks
7. **`business_alignment_checker.ts`** - Validate vs program objectives
8. **`task_refiner.ts`** - Autonomous task rewriting
9. **`model_selector.ts`** - Intelligent model tier selection based on task complexity

---

## Why This Matters

**Current state**: Orchestrator is a task executor (human decides what/when)

**Target state**: Orchestrator is autonomous operator (understands business, decides what/when)

**User expectation** (from feedback):
> "orchestrator should know itself when a task list is insufficient"
> "orchestrator must understand the best most important to production and making money tasks"
> "critics and supervisors must handle this stuff without my intervention"

**This is the gap to close**: From reactive executor → proactive autonomous operator.

---

## Autopilot Execution Plan

**This is a self-improvement task**: Autopilot works on its own orchestrator logic.

1. **Read** existing orchestrator modules (priority_scheduler, task_characteristics, unified_orchestrator)
2. **Design** readiness assessment and business impact scoring logic
3. **Implement** new modules (infrastructure_analyzer, business_value_analyzer, autonomous_executor)
4. **Integrate** into existing orchestrator main loop
5. **Test** with T-MLR-1.2 scenario (should execute autonomously)
6. **Validate** metrics meet success criteria
7. **Document** new autonomous behavior in docs/orchestration/

**Estimated time**: 20-40 hours of autopilot work on itself

**Deliverable**: Orchestrator that autonomously recognizes and executes high-priority work without human intervention.
