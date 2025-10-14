# WeatherVane Orchestration Architecture V2
## The Genius Mode Design

**Last Updated**: October 10, 2025
**Status**: IMPLEMENTING

---

## Philosophy

Build a **world-class autonomous orchestration system** where:
- Claude Code acts as **Staff Engineer/Architect** (reasoning, decisions, coordination)
- Codex acts as **Engineering Team** (parallel execution, autonomous implementation)
- State is managed as a **proper state machine** with SQLite
- Quality is **continuously monitored**, not spot-checked
- Everything is **observable, measurable, improvable**

---

## The Agent Model

### Claude Code: The Architect
**Role**: Strategic thinking, complex decisions, coordination
**Models**: Sonnet 4.5 (default), Opus 4.1 (deep reasoning), Haiku 3.5 (quick checks)
**Strengths**:
- 70.3% SWE-bench, 92% HumanEval (best-in-class)
- Surgical, precise edits
- Deep codebase understanding
- MCP server + client capabilities

**Use For**:
- Architectural decisions
- Complex refactoring requiring multi-file reasoning
- Design reviews and critique
- Breaking down epic tasks into subtasks
- Coordinating Codex workers
- Quality gate decisions

### Codex: The Engineering Team
**Role**: Parallel execution, autonomous implementation
**Models**: GPT-5-Codex (default), codex-1 (o3 optimized)
**Strengths**:
- Cloud sandboxes (isolated, parallel)
- Async task delegation
- Autonomous PR generation
- 200k-token context (full repo)
- Fast execution

**Use For**:
- Implementing well-defined features
- Writing tests for completed code
- Fixing isolated bugs
- Updating documentation
- Running migrations/refactors
- Parallel batch operations (3-5 workers simultaneously)

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│  Orchestration Runtime (TypeScript)                 │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Claude Code Coordinator                   │    │
│  │  • Reads roadmap from StateMachine         │    │
│  │  • Makes architectural decisions           │    │
│  │  • Delegates to Codex workers              │    │
│  │  • Reviews quality metrics                 │    │
│  │  • Extends roadmap when needed             │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Codex Worker Pool (3-5 parallel)          │    │
│  │  • Worker 1: Feature implementation        │    │
│  │  • Worker 2: Test writing                  │    │
│  │  • Worker 3: Bug fixes                     │    │
│  │  • Worker 4: Documentation                 │    │
│  │  • Worker 5: Refactoring                   │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  State Machine (SQLite)                    │    │
│  │  • Task dependency graph                   │    │
│  │  • State transitions with validation       │    │
│  │  • Event log (append-only)                 │    │
│  │  • Quality metrics time-series             │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Quality Monitor (Continuous)              │    │
│  │  • Runs critics on state transitions       │    │
│  │  • Tracks quality scores over time         │    │
│  │  • Blocks progression on failures          │    │
│  │  • Suggests improvements                   │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Observability Layer                       │    │
│  │  • Structured logging (JSON)               │    │
│  │  • Metrics (counters, histograms, gauges)  │    │
│  │  • Traces (causality chains)               │    │
│  │  • Dashboard (real-time monitoring)        │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
┌─────────▼─────────┐    ┌──────────▼──────────┐
│  MCP Server       │    │  State Manager      │
│  (Stateless)      │    │  (SQLite + Events)  │
│                   │    │                     │
│ • file_read       │    │ • tasks             │
│ • file_write      │    │ • dependencies      │
│ • exec_command    │    │ • events            │
│ • git_operations  │    │ • quality_metrics   │
│ • artifact_store  │    │ • checkpoints       │
└───────────────────┘    └─────────────────────┘
```

---

## Workflow Example: Implementing a Feature

### 1. Claude Code Analyzes Epic
```typescript
// Claude Code reads roadmap epic
const epic = await stateMachine.getTask('E1.2');
// E1.2: "Build weather-aware ad optimizer with MMM"

// Claude Code breaks it down
const subtasks = await claudeCode.analyze({
  epic,
  context: await stateMachine.getContext(),
  constraints: await stateMachine.getConstraints()
});

// Generated subtasks with dependencies:
// T1.2.1: Design optimizer API (no deps)
// T1.2.2: Implement baseline optimizer (deps: T1.2.1)
// T1.2.3: Add weather features (deps: T1.2.1)
// T1.2.4: Integrate MMM model (deps: T1.2.2, T1.2.3)
// T1.2.5: Write comprehensive tests (deps: T1.2.4)
// T1.2.6: Add API documentation (deps: T1.2.2)

await stateMachine.addTasks(subtasks);
```

### 2. Task Scheduler Identifies Parallel Work
```typescript
const scheduler = new TaskScheduler(stateMachine);
const ready = await scheduler.getReadyTasks();

// Ready to start (no blocking dependencies):
// - T1.2.1 (design)

// Claude Code takes architectural task
await coordinator.assignToClaudeCode('T1.2.1');

// After T1.2.1 completes, these become ready:
// - T1.2.2 (implementation)
// - T1.2.3 (weather features)
// - T1.2.6 (documentation)

// Codex workers take parallel implementation tasks
await coordinator.assignToCodexWorker('T1.2.2', 'worker1');
await coordinator.assignToCodexWorker('T1.2.3', 'worker2');
await coordinator.assignToCodexWorker('T1.2.6', 'worker3');

// All three execute simultaneously in cloud sandboxes
```

### 3. Quality Monitor Validates Each Transition
```typescript
// After each task completion attempt
stateMachine.on('task:complete_requested', async (task) => {
  // Run quality checks
  const quality = await qualityMonitor.validate(task);
  const qualityCorrelation = `quality:${task.id}:${Date.now().toString(36)}`;

  if (quality.score < 0.85) {
    // Block completion, request fixes
    await stateMachine.transition(
      task.id,
      'needs_improvement',
      {
        issues: quality.issues,
        suggestions: quality.suggestions
      },
      `${qualityCorrelation}:needs_improvement`
    );

    // Assign fix to appropriate agent
    if (quality.needsDeepReasoning) {
      await coordinator.assignToClaudeCode(task.id);
    } else {
      await coordinator.assignToCodexWorker(task.id);
    }
  } else {
    // Allow completion
    await stateMachine.transition(
      task.id,
      'done',
      undefined,
      `${qualityCorrelation}:done`
    );

    // Update metrics
    await metrics.recordQuality(task.id, quality);
  }
});
```

### 4. Continuous Roadmap Extension
```typescript
// Claude Code monitors roadmap health every N tasks
coordinator.on('tasks_completed', async (count) => {
  if (count % 5 === 0) {  // Every 5 tasks
    const health = await stateMachine.getRoadmapHealth();

    if (health.pendingTasks < 5 || health.completionRate > 0.75) {
      // Need to extend roadmap
      const nextPhase = await claudeCode.analyzeNextPhase({
        currentProgress: health,
        context: await stateMachine.getContext(),
        qualityTrends: await metrics.getQualityTrends()
      });

      // Claude Code generates next phase tasks
      const newTasks = await claudeCode.generateTasks(nextPhase);
      await stateMachine.addTasks(newTasks);

      logger.info('Roadmap extended', {
        phase: nextPhase,
        newTasks: newTasks.length,
        reasoning: nextPhase.rationale
      });
    }
  }
});
```

---

## State Machine Schema

### SQLite Database: `state/orchestrator.db`

```sql
-- Task dependency graph
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,  -- 'epic', 'story', 'task', 'bug'
  status TEXT NOT NULL,  -- 'pending', 'in_progress', 'needs_review', 'needs_improvement', 'done', 'blocked'
  assigned_to TEXT,  -- 'claude_code', 'codex_worker_1', etc.
  epic_id TEXT,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  estimated_complexity INTEGER,  -- 1-10
  actual_duration_seconds INTEGER,
  metadata JSON,
  FOREIGN KEY (parent_id) REFERENCES tasks(id),
  FOREIGN KEY (epic_id) REFERENCES tasks(id)
);

-- Task dependencies (DAG edges)
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'blocks',  -- 'blocks', 'related', 'suggested'
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id)
);

-- Event log (append-only, immutable)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  task_id TEXT,
  agent TEXT,
  data JSON NOT NULL,
  correlation_id TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Quality metrics over time
CREATE TABLE quality_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  task_id TEXT,
  dimension TEXT NOT NULL,  -- 'code_elegance', 'test_coverage', etc.
  score REAL NOT NULL,  -- 0.0-1.0
  details JSON,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Checkpoints (versioned snapshots)
CREATE TABLE checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  git_sha TEXT,
  state_snapshot JSON NOT NULL,  -- Compact summary
  notes TEXT
);

-- Context (structured decisions and learnings)
CREATE TABLE context_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  entry_type TEXT NOT NULL,  -- 'decision', 'constraint', 'hypothesis', 'learning'
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  related_tasks TEXT,  -- JSON array of task IDs
  confidence REAL,  -- 0.0-1.0
  metadata JSON
);

-- Indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_task ON events(task_id);
CREATE INDEX idx_quality_task ON quality_metrics(task_id);
CREATE INDEX idx_quality_timestamp ON quality_metrics(timestamp);
```

---

## Key Improvements Over V1

| Aspect | V1 (Current) | V2 (Genius Mode) |
|--------|--------------|------------------|
| **Control Flow** | Bash loop drives LLMs | LLMs drive orchestration |
| **State** | YAML files, manual edits | SQLite state machine, atomic transitions |
| **Task Model** | Flat TODO list | Dependency graph (DAG) |
| **Agent Usage** | Single agent, sequential | Claude coordinates, Codex parallelizes |
| **Quality** | Spot checks on demand | Continuous validation on transitions |
| **Observability** | Bash echo, log files | Structured events, metrics, traces |
| **Context** | Markdown file (write-only) | Structured, queryable, versioned |
| **Roadmap** | Manual YAML updates | Self-extending with AI analysis |
| **Storage** | 20+ files, scattered | Single SQLite DB + event log |
| **Complexity** | ~4,500 lines (TS + bash) | ~2,000 lines (clean separation) |

---

## Implementation Plan

### Phase 1: Foundation (Days 1-2)
- [ ] Build StateMachine with SQLite backend
- [ ] Implement event logging system
- [ ] Create thin MCP server (stateless tools only)
- [ ] Migrate roadmap.yaml → tasks table

### Phase 2: Orchestration (Days 3-4)
- [ ] Build ClaudeCodeCoordinator
- [ ] Build CodexWorkerPool (parallel execution)
- [ ] Implement TaskScheduler (dependency resolution)
- [ ] Build QualityMonitor (continuous validation)

### Phase 3: Intelligence (Days 5-6)
- [ ] Adaptive roadmap extension
- [ ] Structured context system
- [ ] Quality trend analysis
- [ ] Smart agent routing

### Phase 4: Polish (Days 7-8)
- [ ] Observability dashboard
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation

---

## Success Metrics

The system is working at genius level when:

✅ **Velocity**: Ships 10+ meaningful features per day
✅ **Quality**: Maintains 85%+ across all quality dimensions
✅ **Autonomy**: Runs for 24+ hours without human intervention
✅ **Efficiency**: Claude:Codex ratio is 1:5 (coordinator:workers)
✅ **Intelligence**: Auto-extends roadmap with valuable next tasks
✅ **Reliability**: Zero state corruption, clean rollback capability

---

## Next Steps

Start with Phase 1: Build the StateMachine foundation.
