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

### 2.1. Dynamic Prompt Evolution (DSPy-Style Optimization)

**Objective:** Eliminate hardcoded prompt failures by evolving prompts using **Declarative Self-improving** principles (inspired by DSPy).

**Deep Implementation:**
*   **Concept:** Instead of manual string manipulation, we define **Signatures** (Input/Output specs). The "Prompt" is a compiled artifact containing instructions + **Few-Shot Examples** mined from successful past runs.
*   **Storage:** `state/prompts/optimizers.json`.
*   **Optimization Algorithm (BootstrapFewShot):**
    1.  **Teacher:** A strong model (Gemini 3 / o3) generates a demonstration for a task.
    2.  **Validator:** If the demo passes all tests, it is saved as a "Golden Trace."
    3.  **Compiler:** The prompt is dynamically assembled: `Base Instruction + Top 3 Relevant Golden Traces`.
*   **Mutation (Teleprompter):** If performance stagnates, the system uses an LLM to rewrite the `Base Instruction` based on failure analysis of recent traces.

**Data Structures:**
```typescript
interface PromptSignature {
  id: string; // e.g., "refactor_function"
  inputs: string[]; // ["code", "goal"]
  outputs: string[]; // ["refactored_code", "explanation"]
  baseInstruction: string;
  demos: Trace[]; // Successful past executions
}
```

### 2.2. Signal-Based Coordination (Solving "Bottlenecks")

**Objective:** Decentralize coordination using Stigmergy.

**Deep Implementation:**
*   **Scanner:** A background process running every 5 seconds (configurable).
*   **Parsing:** Uses `ripgrep` for speed (`rg "@(CRITICAL|TODO|...):"`) to locate tags.
*   **State Tracking:** Maintains an in-memory `SignalMap` to track which signals are currently being claimed by agents to prevent double-work.

**The Stigmergy Protocol (Annotations):**
| Signal | Meaning | Target Agent | Action |
| :--- | :--- | :--- | :--- |
| `@CRITICAL: <msg>` | Blocking issue. | **Firefighter** | Drop everything, fix immediately. |
| `@NEEDS_REVIEW: <msg>` | Unverified code. | **Reviewer** | Run tests, check logic. |
| `@UNCERTAIN: <msg>` | Unsure logic. | **Architect** | Analyze context, provide guidance. |
| `@DECAY: <msg>` | Messy code. | **Janitor** | Refactor when idle. |
| `@TODO: <msg>` | Planned feature. | **Builder** | Implement when dependencies met. |

**Potential Problems & Solutions:**
*   **Problem: Race Conditions.** (Two agents see `@TODO` and start working).
    *   *Solution:* **Claim Files.** When an agent picks up a signal, it writes a `.claim.<hash>` file next to the target. Other agents check for claims before starting. Claims expire after 30 mins (heartbeat).
*   **Problem: Signal Rot.** (Old `@TODO` tags that are no longer relevant).
    *   *Solution:* **The Reaper.** A background job checks signal timestamps (via git blame). Signals older than 30 days are marked `@STALE`. If not refreshed in 7 days, they are auto-deleted.
*   **Problem: Signal Spam.** (Agent gets stuck in a loop creating tags).
    *   *Solution:* **Rate Limiting.** `SignalManager` blocks an agent from creating more than 5 signals per minute.

### 2.3. Predictive Execution Loop (Solving "Reactivity")

**Objective:** Active Inference (Predict -> Act -> Verify).

**Deep Implementation:**
*   **Prediction Schema:**
    ```typescript
    interface Prediction {
      hypothesis: string; // "The test will pass"
      expectedOutput: string; // Regex or exact string
      verificationTool: string; // "run_test", "read_file"
      verificationArgs: object;
    }
    ```
*   **Surprise Calculation:**
    *   Execute `verificationTool`.
    *   Compare output to `expectedOutput`.
    *   `Surprise = 1.0 - Similarity(output, expected)`.

**Potential Problems & Solutions:**
*   **Problem: Hallucinated Verification.** (Agent predicts "Test passes" but runs `echo "Test passed"`).
    *   *Solution:* **Tool Whitelist.** The `verificationTool` MUST be a read-only observation tool (test runner, grep, file read). It cannot be a shell command that writes output.
*   **Problem: False Positives.** (Test passes but for the wrong reason).
    *   *Solution:* **Negative Testing.** The agent must occasionally predict failure ("If I break this line, the test *should* fail"). If it still passes, the test is broken.
*   **Problem: Infinite Correction Loops.** (Predict -> Fail -> Fix -> Predict -> Fail...).
    *   *Solution:* **Frustration Counter.** If `Surprise > 0.5` for 3 consecutive attempts, the loop aborts and escalates to the **Architect** agent with an `@UNCERTAIN` tag.

### 2.4. Proactive Maintenance & Curiosity (Solving "Idle Capacity")

**Objective:** Self-improvement during idle time.

**Deep Implementation:**
*   **Entropy Calculation:**
    *   $H(file) = w_1 \cdot Complexity + w_2 \cdot (1 - Coverage) + w_3 \cdot LintErrors$
    *   Files with top 10% $H$ scores get `@DECAY` tags.
*   **Episodic Memory (Vector Store):**
    *   **Storage:** `state/memory/vectors.jsonl` (or local ChromaDB).
    *   **Content:** Embeddings of past "Strategy Memos" and "Post-Mortems."
    *   **Retrieval:** Before starting a task, the agent queries memory: "How did we solve similar errors?"
*   **Knowledge Graph:**
    *   Nodes: Concepts ("Auth", "DB"), Files (`auth.ts`), Patterns ("Singleton").
    *   Edges: "ImplementedBy", "RelatedTo", "Violates".
    *   Stored in `state/knowledge_graph.json` (or SQLite for scale).
# ARCHITECTURE_V2: The Cognitive Organism (Autopilot 100x)

## 0. The Manifesto
**We are not building a script. We are building a synthetic colleague.**
The goal of Autopilot V2 is to create the world's greatest autonomous coding tool—a system that is **curious**, **antifragile**, and **relentlessly self-improving**. It does not wait for commands; it seeks purpose. It does not break under pressure; it learns. It is not a black box; it is a transparent, living organism that lives in your terminal and builds your vision while you sleep.

---

## 1. Core Concepts

**Core Philosophy:**
- **Problem-First:** Every component exists to solve a specific limitation of the V1 architecture.
- **Biological Inspiration:** The system behaves like an organism (homeostasis, evolution, stigmergy) rather than a script.
- **Antifragility:** The system gains strength from stressors (errors, novel tasks) rather than breaking.

### 1.1. Definitions: The Builder vs. The Building
To avoid ambiguity, we strictly define the relationship between the agent and the codebase:

*   **The Autopilot (Subject/Builder):** The "Cognitive Organism" defined in this document. It is the *worker*. It runs on the machine, consumes tokens, and executes tools. It is the *means* of production.
*   **WeatherVane (Object/Building):** The target software product being developed. It is the *work*. The Autopilot acts *upon* the WeatherVane codebase.
    *   *Crucial Distinction:* The Autopilot must treat WeatherVane as its "Environment." It lives *inside* the repo but is distinct from the product logic.
    *   *Self-Improvement:* When the Autopilot refactors `tools/wvo_mcp`, it is performing "Self-Surgery" (improving the Builder). When it refactors `src/app`, it is performing "Construction" (improving the Building).

### 1.2. Human-Agent Symbiosis (The Interface of Intent)
How does the User direct this organism without micromanaging it?

*   **Input: Strategy Memos (`state/memos/`)**
    *   The User writes high-level intent in markdown (e.g., `2025-11-20-scale-auth.md`).
    *   The **Architect Agent** parses these memos, converts them into `@TODO` signals, and updates the `implementation_plan.md`.
*   **Output: The Membrane & PRs**
    *   **Real-time:** The CLI HUD ("The Membrane") shows the pulse of the system.
    *   **Asynchronous:** The Agent opens PRs with "Strategy Alignment" summaries, explaining *why* a change was made and linking back to the User's memo.
*   **Feedback Loop:**
    *   User comments on a PR -> Agent treats this as a "Correction Signal" -> Updates `prompts/optimizers.json` (Learning).

---

## 2. Module Specifications (Deep Dive)
**Potential Problems & Solutions:**
*   **Problem: Destructive Curiosity.** (Agent "refactors" critical code and breaks it).
    *   *Solution:* **Sandboxed Refactoring.** Curiosity tasks run on a separate git branch (`curiosity/task-id`). They are only merged to `main` if they pass ALL tests and a rigorous "Regression Check."
*   **Problem: Token Burn.** (Agent spends $100/day on useless exploration).
    *   *Solution:* **Budget Enforcer.** Hard daily limit on Curiosity tokens (e.g., $5.00). Once hit, the Curiosity Engine sleeps until UTC midnight.

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

### 2.6. Adaptive Compute Efficiency (Solving "Cost/Latency")

**Objective:** Optimize Token Return on Investment (TROI) by routing tasks to the best model provider (Gemini, Claude, Codex).

**Deep Implementation:**
*   **Provider Swarm:** The system integrates three distinct CLIs:
    *   **Codex:** Default for low-latency code generation and simple refactors.
    *   **Claude Code:** Specialized for "Reviewer" and "Janitor" tasks (strong instruction following).
    *   **Gemini 3 CLI:** Designated for **"Architect"** and **"Deep Lane"** tasks due to superior long-context reasoning and multimodal capabilities.
*   **Router Model:** A small, fine-tuned classifier (or few-shot Gemini 2.0 Flash) that takes the task description and outputs a complexity score (1-10).
*   **Routing Logic:**
    *   Score 1-3: **Fast Lane** (Gemini 2.0 Flash / Claude 3.5 Haiku). Direct execution.
    *   Score 4-7: **Standard Lane** (Gemini 2.0 Pro / Claude 3.5 Sonnet). Standard loop.
    *   Score 8-10: **Deep Lane** (Gemini 3 / o3). System 2 Reflection + decomposition.

**Potential Problems & Solutions:**
*   **Problem: Misclassification.** (Hard task routed to Fast Lane).
    *   *Solution:* **Escalation Protocol.** If a Fast Lane agent fails 2x, the task is automatically re-routed to the Standard Lane with a "Complexity Bump."
*   **Problem: Context Window Overflow.** (Deep Lane tasks accumulate massive context).
    *   *Solution:* **Context Summarization.** Before passing context to the Reasoning Model, the `ContextCompressor` summarizes past steps, keeping only the "Strategy Memo" and the last error.
    *   *Gemini Advantage:* Gemini 3's massive context window allows it to skip compression for "Whole Repo" analysis tasks.

### 2.7. Legacy Cleanup Protocol (Solving "Technical Debt")

**Objective:** Systematically sanitize the codebase to remove V1 legacy artifacts and enforce V2 standards.

**Deep Implementation:**
*   **The "Grim Reaper" Agent:** A specialized agent that runs a one-time (or periodic) "Purge" workflow.
*   **Workflow:**
    1.  **Map:** Generate a dependency graph of all files. Identify "Orphan Nodes" (files not imported by `index.ts` or tests).
    2.  **Verify:** For each orphan, run a "Usage Check" (grep for dynamic imports or config usage).
    3.  **Delete:** If confirmed unused, move to `.trash/` (staged deletion).
    4.  **Refactor:** For active files, apply "V2 Standardization":
        -   Add strict types.
        -   Add missing docstrings.
        -   Remove commented-out code blocks > 5 lines.
        -   Convert legacy `console.log` to `logger.info`.
      *Solution:* **The Graveyard.** Deleted files are moved to a `.trash/` directory for 7 days before permanent deletion. A "Resurrect" tool allows easy recovery.

### 2.8. Git & GitHub Hygiene (The Evolutionary Record)

**Objective:** Transform the "dirty" repository into a clean, semantic history of the organism's evolution.

**Deep Implementation:**
*   **The "Great Filter" (Initial Cleanup):**
    1.  **Aggressive .gitignore:** Ignore all `state/` (except `prompts/` and `docs/`), `logs/`, `tmp/`, and `dist/`.
    2.  **History Rewrite:** (Optional) If history is massive/sensitive, use `git-filter-repo` to strip blobs >10MB and secrets.
    3.  **Lint Enforcement:** Pre-commit hooks (Husky) prevent "dirty" code from entering the local stage.

*   **Branching Strategy ("Controlled Mutations"):**
    *   `main`: The **Stable Phenotype**. MUST pass all tests. Protected branch.
    *   `feat/<task-id>`: **Functional Mutations**. Created by Builder agents.
    *   `fix/<signal-id>`: **Antibodies**. Created by Firefighter agents.
    *   `curiosity/<topic>`: **Experimental Mutations**. Sandboxed; auto-deleted if experiments fail.

*   **The "Immune Gate" (PR Protocol):**
    *   **Rule:** No agent pushes directly to `main`.
    *   **Flow:**
        1.  Agent completes task on `feat/xyz`.
        2.  Agent opens PR: "feat: implement predictive loop".
        3.  **Reviewer Agent** (Claude Code) runs CI checks and posts comments.
        4.  If CI passes + Reviewer approves -> **Squash & Merge**.

*   **Semantic History:**
    *   Agents MUST use **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:`).
    *   Commit messages must include the "Why" (Strategy Memo summary), not just the "What".

### 2.9. Tactical Git Reset (Immediate Action Plan)

**Current State Analysis:**
- **Branch:** `main` (Ahead of origin by 25 commits).
- **Dirty State:** Critical files (`worker_entry.ts`, `index-claude.ts`) are modified but uncommitted.
- **Branch Rot:** Dozens of stale `task/AFP-...` and `worktree-snapshot` branches exist.

**Execution Steps:**
1.  **Snapshot:** Create a backup branch `backup/pre-v2-migration`.
2.  **Commit Fixes:** Commit the current orchestration fixes as `fix(core): activate autopilot orchestration layer`.
3.  **Prune:** Run `git fetch --prune` and delete all local branches not merged to main (except backup).
4.  **Ignore:** Apply the new `.gitignore` to stop tracking `state/` files.
5.  **Push:** Force push `main` to origin (after verifying no data loss) to establish the new baseline.

### 2.10. The Membrane (Interface)

**Objective:** Create the "World's Best CLI Interface" - a "bitchin" HUD that makes the user feel like they are piloting a spaceship, not running a script.

**Deep Implementation:**
*   **Tech Stack:** **Ink** (React for CLI) + **Pastel** (Framework) + **Zod** (Validation).
*   **Visual Language:**
    *   **Gradients:** Use `ink-gradient` for headers (Brand colors: Cyan -> Purple).
    *   **Typography:** Nerd Fonts symbols for status (⚡, 🧠, 🛡️).
    *   **Animations:** Smooth spinners (`ink-spinner`) for active tasks.

**The HUD (Head-Up Display):**
Instead of scrolling text, the CLI renders a static, updating dashboard:

```text
┌─ WeatherVane Autopilot v2.0 ──────────────────────────────────────────────┐
│ ⚡ Status: DEFCON 5 (Peace)   │ 💰 Burn: $0.42   │ 🧠 Context: 12k/200k │
├───────────────────────────────────────────────────────────────────────────┤
│ ACTIVE AGENTS                                                             │
│ ├─ 🏗️ Builder-01: Implementing "Predictive Loop" [Writing tests...]      │
│ ├─ 🔎 Reviewer-02: Verifying "feat/auth-flow"    [Running CI...]         │
│ └─ 🧹 Janitor-01:  Refactoring "utils.ts"        [Idle]                  │
├───────────────────────────────────────────────────────────────────────────┤
│ THOUGHT STREAM (Matrix Mode)                                              │
│ > [Builder-01] Test failed. Expected 200, got 404. Adjusting mock...      │
│ > [Orchestrator] Spawning new agent for @CRITICAL tag in server.ts...     │
│ > [Janitor-01] Found 3 unused imports in auth.ts. Cleaning...             │
└───────────────────────────────────────────────────────────────────────────┘
```

*   **Interactive Mode:**
    *   Press `d` to toggle "Debug View" (raw logs).
    *   Press `p` to pause/resume.
    *   Press `q` to gracefully shutdown (finish current tasks then exit).

### 2.11. Model Intelligence (Meta-Orchestration)

**Objective:** Ensure the Autopilot *always* uses the latest, most efficient models without manual code updates.

**Deep Implementation:**
*   **Dynamic Model Registry:**
    *   **Storage:** `state/models/registry.json`.
    *   **Schema:**
        ```typescript
        interface ModelProfile {
          id: string; // "gemini-1.5-pro-latest"
          provider: "google" | "anthropic" | "openai";
          capabilities: ["vision", "coding", "reasoning"];
          costPer1k: number;
          benchmarkScore: number; // SWE-bench score
          releaseDate: string;
        }
        ```

*   **The "Scout" Agent (Continuous Discovery):**
    *   **Task:** Runs weekly (or on demand).
    *   **Action:**
        1.  Searches web: "latest LLM benchmarks coding 2025".
        2.  Parses results to find new models (e.g., "Gemini 3.0 released").
        3.  Updates `registry.json`.
        4.  **Self-Optimization:** If a new model is cheaper/better, it updates `src/body/router.ts` configuration to promote it to the "Fast Lane" or "Deep Lane".

*   **Mixture of Agents (MoA) Routing:**
    *   Instead of a single model per task, the **Router** assigns sub-tasks to the best specialist:
        *   *Architecting:* **o1 / Gemini 3** (Reasoning).
        *   *Coding:* **Claude 3.5 Sonnet** (Coding).
        *   *Refactoring:* **Gemini 1.5 Flash** (Context/Speed).

---

## 3. Risk Mitigation & Immune System (Pre-Mortem Analysis)

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

## 5. Agentic Execution Graph (Implementation Plan)

This roadmap is structured as a **Dependency Graph** for an autonomous agent. Execute nodes in order. Do not proceed to the next node until the **Verification Gate** passes.

### Phase 0: The Foundation (Manual/Bootstrapping)
*   **Node 0.1: Tactical Reset**
    *   *Goal:* Clean the repo state.
    *   *Action:* Execute Section 2.9 (Snapshot, Commit, Prune, Ignore).
    *   *Gate:* `git status` is clean, `git branch` shows only `main` and `backup`.

*   **Node 0.2: The Membrane (UI Shell)**
    *   *Goal:* Build the Ink CLI shell so we can visualize the rest of the build.
    *   *Action:* Implement Section 2.10 (Ink, Pastel, HUD).
    *   *Gate:* `npm run autopilot` launches the "Bitchin" Dashboard.

### Phase 1: The Nervous System (Coordination)
*   **Node 1.1: Stigmergy Scanner**
    *   *Requires:* Node 0.1
    *   *Goal:* Implement `SignalScanner` and `SignalMap`.
    *   *Action:* Create `src/nervous/scanner.ts` using `ripgrep`.
    *   *Gate:* Write a file with `@TODO: test`, run scanner, verify it appears in `SignalMap`.

*   **Node 1.2: Agent Dispatcher**
    *   *Requires:* Node 1.1
    *   *Goal:* Route signals to Agent Loops.
    *   *Action:* Create `src/nervous/dispatcher.ts`.
    *   *Gate:* `@CRITICAL` tag triggers a log message "Dispatching to Firefighter".

### Phase 2: The Brain (Cognition)
*   **Node 2.1: DSPy Optimizer**
    *   *Requires:* Node 1.2
    *   *Goal:* Implement Prompt Signatures and Bootstrap logic.
    *   *Action:* Create `src/brain/optimizer.ts` and `state/prompts/optimizers.json`.
    *   *Gate:* Run a dummy task, verify `optimizers.json` updates with a new trace.

*   **Node 2.2: Episodic Memory**
    *   *Requires:* Node 2.1
    *   *Goal:* Vector store for past experiences.
    *   *Action:* Create `src/brain/memory.ts` (Vector Store wrapper).
    *   *Gate:* Store "test_memory", Query "test", verify retrieval.

### Phase 3: The Body (Action)
*   **Node 3.1: Tool Smith**
    *   *Requires:* Node 2.2
    *   *Goal:* Dynamic tool generation.
    *   *Action:* Create `src/body/tool_smith.ts` and AST Validator.
    *   *Gate:* Agent generates `tools/custom/add.ts`, validates it, and uses it to add 2+2.

*   **Node 3.2: Adaptive Router**
    *   *Requires:* Node 3.1
    *   *Goal:* Route tasks to Gemini/Claude/Codex.
    *   *Action:* Create `src/body/router.ts` with complexity classifier.
    *   *Gate:* "Fix typo" -> Fast Lane; "Refactor Architecture" -> Deep Lane.

### Phase 4: The Immune System (Safety)
*   **Node 4.1: Git Hygiene Enforcer**
    *   *Requires:* Node 3.2
    *   *Goal:* Enforce PRs and Conventional Commits.
    *   *Action:* Setup Husky hooks and `ReviewerAgent`.
    *   *Gate:* Try to push to `main` -> Fail. Open PR -> Reviewer comments.xWorkerPool (parallel execution)
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
