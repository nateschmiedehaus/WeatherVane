# PLAN Phase: TaskFlow CLI - Implementation Design

**Task ID:** AFP-AUTOPILOT-TEST-PROJECT-20251105
**Date:** 2025-11-05
**Phase:** PLAN
**Depends On:** spec.md (10 features defined)

---

## ARCHITECTURE

### Project Structure

```
tools/taskflow/
├── package.json           # Node.js project config
├── tsconfig.json          # TypeScript config
├── README.md              # Usage instructions + task list
├── .gitignore             # Ignore node_modules, dist
├── src/
│   ├── index.ts          # CLI entry point
│   ├── taskManager.ts    # Core task operations (add, list, done, etc.)
│   ├── fileStorage.ts    # JSON file I/O operations
│   ├── formatter.ts      # Output formatting + colors
│   └── types.ts          # Task interface definitions
└── .taskflow.json        # (created by init command)
```

**Total Files to Create:** 9 files (~300 LOC total)

---

## IMPLEMENTATION PLAN

### PLAN-authored Tests
- `npm --prefix tools/taskflow run build` — ensure TypeScript compilation succeeds for the new CLI.
- `npm --prefix tools/taskflow run test` — author unit tests covering `taskManager` add/list/done workflows (initially failing until IMPLEMENT fills in behaviour).
- `node dist/index.js --help` (manual after build) — validate CLI entry point emits usage info.
- `node scripts/taskflow_smoke.mjs` — happy-path integration exercising `taskflow add`, `taskflow list`, `taskflow done`.
- Autopilot validation: integrate the CLI into Wave 0 smoke by running `npm run wave0 -- --taskflow-smoke` and confirming a task completes end-to-end.

## Implementation Files

### File 1: package.json

**Purpose:** Node.js project configuration

**Content:**
```json
{
  "name": "taskflow",
  "version": "1.0.0",
  "description": "Minimal CLI task tracker for autopilot validation",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  }
}
```

**LOC:** ~20 lines

---

### File 2: tsconfig.json

**Purpose:** TypeScript compiler configuration

**Content:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**LOC:** ~15 lines

---

### File 3: src/types.ts

**Purpose:** Type definitions

**Content:**
```typescript
export interface Task {
  id: number;
  description: string;
  status: 'pending' | 'done';
  createdAt: string;
}

export interface TaskStore {
  tasks: Task[];
  nextId: number;
}
```

**LOC:** ~10 lines

---

### File 4: src/fileStorage.ts

**Purpose:** JSON file I/O operations

**Functions:**
- `initStorage()` - Create .taskflow.json
- `loadTasks()` - Read from file
- `saveTasks(store)` - Write to file
- `storageExists()` - Check if file exists

**Content:**
```typescript
import fs from 'fs';
import path from 'path';
import { TaskStore } from './types';

const STORAGE_FILE = '.taskflow.json';

export function initStorage(): void {
  if (storageExists()) {
    throw new Error('.taskflow.json already exists');
  }
  const initialStore: TaskStore = { tasks: [], nextId: 1 };
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(initialStore, null, 2));
}

export function storageExists(): boolean {
  return fs.existsSync(STORAGE_FILE);
}

export function loadTasks(): TaskStore {
  if (!storageExists()) {
    throw new Error('.taskflow.json not found. Run "taskflow init" first.');
  }
  const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
  return JSON.parse(data);
}

export function saveTasks(store: TaskStore): void {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2));
}
```

**LOC:** ~30 lines

---

### File 5: src/formatter.ts

**Purpose:** Output formatting with colors

**Functions:**
- `formatTask(task)` - Format single task with colors
- `formatTaskList(tasks)` - Format list of tasks
- `formatStats(store)` - Format statistics

**Content:**
```typescript
import chalk from 'chalk';
import { Task, TaskStore } from './types';

export function formatTask(task: Task): string {
  const checkbox = task.status === 'done' ? chalk.green('[✓]') : chalk.yellow('[ ]');
  const description = task.status === 'done'
    ? chalk.green(task.description)
    : chalk.yellow(task.description);
  return `#${task.id} ${checkbox} ${description} (created: ${task.createdAt})`;
}

export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "No tasks found. Use 'taskflow add' to create one.";
  }
  return tasks.map(formatTask).join('\n');
}

export function formatStats(store: TaskStore): string {
  const total = store.tasks.length;
  const pending = store.tasks.filter(t => t.status === 'pending').length;
  const done = store.tasks.filter(t => t.status === 'done').length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  return `
Total tasks: ${total}
Pending: ${chalk.yellow(pending)}
Done: ${chalk.green(done)}
Completion rate: ${rate}%
  `.trim();
}
```

**LOC:** ~35 lines

---

### File 6: src/taskManager.ts

**Purpose:** Core task operations

**Functions:**
- `addTask(description)` - Add new task
- `listTasks(statusFilter?)` - List tasks (with optional filter)
- `markTaskDone(id)` - Mark task complete
- `removeTask(id)` - Remove task
- `getStats()` - Get statistics

**Content:**
```typescript
import { loadTasks, saveTasks } from './fileStorage';
import { Task, TaskStore } from './types';

export function addTask(description: string): Task {
  const store = loadTasks();
  const newTask: Task = {
    id: store.nextId,
    description,
    status: 'pending',
    createdAt: new Date().toISOString().split('T')[0]
  };
  store.tasks.push(newTask);
  store.nextId++;
  saveTasks(store);
  return newTask;
}

export function listTasks(statusFilter?: 'pending' | 'done'): Task[] {
  const store = loadTasks();
  if (statusFilter) {
    return store.tasks.filter(t => t.status === statusFilter);
  }
  return store.tasks;
}

export function markTaskDone(id: number): void {
  const store = loadTasks();
  const task = store.tasks.find(t => t.id === id);
  if (!task) {
    throw new Error(`Task #${id} not found`);
  }
  task.status = 'done';
  saveTasks(store);
}

export function removeTask(id: number): void {
  const store = loadTasks();
  const index = store.tasks.findIndex(t => t.id === id);
  if (index === -1) {
    throw new Error(`Task #${id} not found`);
  }
  store.tasks.splice(index, 1);
  saveTasks(store);
}

export function getStats(): TaskStore {
  return loadTasks();
}
```

**LOC:** ~50 lines

---

### File 7: src/index.ts

**Purpose:** CLI entry point (command parsing)

**Commands:**
- `taskflow init`
- `taskflow add "description"`
- `taskflow list [--status pending|done]`
- `taskflow done [id]`
- `taskflow remove [id]`
- `taskflow stats`
- `taskflow help`

**Content:**
```typescript
#!/usr/bin/env node
import { initStorage, storageExists } from './fileStorage';
import { addTask, listTasks, markTaskDone, removeTask, getStats } from './taskManager';
import { formatTaskList, formatStats } from './formatter';
import chalk from 'chalk';

const args = process.argv.slice(2);
const command = args[0];

try {
  switch (command) {
    case 'init':
      initStorage();
      console.log(chalk.green('✓ Initialized TaskFlow in ' + process.cwd()));
      break;

    case 'add':
      const description = args.slice(1).join(' ');
      if (!description) {
        console.error(chalk.red('Error: Please provide a task description'));
        process.exit(1);
      }
      const task = addTask(description);
      console.log(chalk.green(`✓ Added task #${task.id}: ${task.description}`));
      break;

    case 'list':
      const statusArg = args.indexOf('--status');
      const statusFilter = statusArg !== -1 ? args[statusArg + 1] as 'pending' | 'done' : undefined;
      const tasks = listTasks(statusFilter);
      console.log(formatTaskList(tasks));
      break;

    case 'done':
      const doneId = parseInt(args[1]);
      if (isNaN(doneId)) {
        console.error(chalk.red('Error: Please provide a valid task ID'));
        process.exit(1);
      }
      markTaskDone(doneId);
      console.log(chalk.green(`✓ Marked task #${doneId} as done`));
      break;

    case 'remove':
      const removeId = parseInt(args[1]);
      if (isNaN(removeId)) {
        console.error(chalk.red('Error: Please provide a valid task ID'));
        process.exit(1);
      }
      removeTask(removeId);
      console.log(chalk.green(`✓ Removed task #${removeId}`));
      break;

    case 'stats':
      const store = getStats();
      console.log(formatStats(store));
      break;

    case 'help':
    case '--help':
    case undefined:
      console.log(`
TaskFlow - Minimal CLI Task Tracker

Usage:
  taskflow init                    Initialize task list
  taskflow add "description"       Add a new task
  taskflow list                    List all tasks
  taskflow list --status pending   List pending tasks
  taskflow list --status done      List completed tasks
  taskflow done [id]               Mark task as done
  taskflow remove [id]             Remove a task
  taskflow stats                   Show statistics
  taskflow help                    Show this help

Examples:
  taskflow add "Buy groceries"
  taskflow done 1
  taskflow list --status pending
      `.trim());
      break;

    default:
      console.error(chalk.red(`Error: Unknown command "${command}"`));
      console.log('Run "taskflow help" for usage information');
      process.exit(1);
  }
} catch (error) {
  console.error(chalk.red('Error: ' + (error as Error).message));
  process.exit(1);
}
```

**LOC:** ~90 lines

---

### File 8: README.md

**Purpose:** Documentation and task list for autopilot

**Content:**
```markdown
# TaskFlow - Minimal CLI Task Tracker

Autopilot validation project: Prove Wave 0 can autonomously build a functioning CLI tool.

## Installation

```bash
cd tools/taskflow
npm install
npm run build
```

## Usage

```bash
# Initialize task list
npm start init

# Add tasks
npm start add "Buy groceries"
npm start add "Fix bug"

# List tasks
npm start list
npm start list --status pending

# Complete tasks
npm start done 1

# Remove tasks
npm start remove 2

# View statistics
npm start stats
```

## Autopilot Task List

**Epic:** TASKFLOW-VALIDATION

**Tasks for Wave 0 to complete:**

1. [ ] TASKFLOW-001: Set up project structure (package.json, tsconfig.json, folders)
2. [ ] TASKFLOW-002: Implement types.ts (Task and TaskStore interfaces)
3. [ ] TASKFLOW-003: Implement fileStorage.ts (init, load, save, exists functions)
4. [ ] TASKFLOW-004: Implement formatter.ts (formatTask, formatTaskList, formatStats)
5. [ ] TASKFLOW-005: Implement taskManager.ts (addTask, listTasks functions)
6. [ ] TASKFLOW-006: Implement taskManager.ts (markTaskDone, removeTask functions)
7. [ ] TASKFLOW-007: Implement index.ts CLI parser (init, add, list commands)
8. [ ] TASKFLOW-008: Implement index.ts CLI parser (done, remove, stats commands)
9. [ ] TASKFLOW-009: Implement index.ts help command
10. [ ] TASKFLOW-010: Test end-to-end (verify all commands work)

**Success Criteria:** ≥8 tasks completed, TaskFlow CLI functional

## License

MIT
```

**LOC:** ~60 lines

---

### File 9: .gitignore

**Purpose:** Ignore generated files

**Content:**
```
node_modules/
dist/
.taskflow.json
*.log
```

**LOC:** ~5 lines

---

## TOTAL IMPLEMENTATION SCOPE

**Files to Create:** 9
- package.json (20 LOC)
- tsconfig.json (15 LOC)
- src/types.ts (10 LOC)
- src/fileStorage.ts (30 LOC)
- src/formatter.ts (35 LOC)
- src/taskManager.ts (50 LOC)
- src/index.ts (90 LOC)
- README.md (60 LOC)
- .gitignore (5 LOC)

**Total LOC:** ~315 lines

**Constraint Check:** ≤5 files per task? ❌ NO (9 files)
**Solution:** Split into 2 tasks:
- Task 1: Project setup (5 files: package.json, tsconfig, .gitignore, README, types.ts)
- Task 2: Implementation (4 files: fileStorage, formatter, taskManager, index)

---

## WAVE 0 INTEGRATION

### Approach 1: Add TaskFlow Tasks to WeatherVane Roadmap (SELECTED)

**Method:** Add TASKFLOW-001 through TASKFLOW-010 to `state/roadmap.yaml`

**Structure:**
```yaml
- id: EPIC-TASKFLOW-VALIDATION
  title: "TaskFlow CLI - Autopilot Validation Project"
  type: epic
  status: pending
  description: "Prove Wave 0 can autonomously build functioning CLI tool"

  tasks:
    - id: TASKFLOW-001
      title: "Set up TaskFlow project structure"
      status: pending
      depends_on: []
      acceptance_criteria:
        - package.json created with correct scripts
        - tsconfig.json configured
        - Folders created (src/)
        - .gitignore added
        - README.md with initial documentation

    - id: TASKFLOW-002
      title: "Implement TaskFlow type definitions"
      status: pending
      depends_on: [TASKFLOW-001]
      acceptance_criteria:
        - Task interface defined
        - TaskStore interface defined
        - Exports correct

    # ... (continue for all 10 tasks)
```

**Pros:**
- ✅ Works with existing Wave 0 (no code changes)
- ✅ Tasks visible in main roadmap
- ✅ Standard workflow

**Cons:**
- Adds tasks to production roadmap (but clearly labeled as validation)

---

### Approach 2: Separate TaskFlow Roadmap

**Method:** Create `tools/taskflow/roadmap.yaml`, modify Wave 0 to read it

**Pros:**
- Clean separation (validation vs. production)

**Cons:**
- ❌ Requires Wave 0 code changes (more complexity)
- ❌ Harder to track progress

**Verdict:** REJECTED - Use Approach 1 (simpler)

---

## VALIDATION WORKFLOW

### Step 1: Set Up TaskFlow Project (Manual)

```bash
# Create folder structure
mkdir -p tools/taskflow/src

# Create initial files (empty or templates)
touch tools/taskflow/package.json
touch tools/taskflow/tsconfig.json
touch tools/taskflow/.gitignore
touch tools/taskflow/README.md
touch tools/taskflow/src/types.ts
touch tools/taskflow/src/fileStorage.ts
touch tools/taskflow/src/formatter.ts
touch tools/taskflow/src/taskManager.ts
touch tools/taskflow/src/index.ts
```

**OR:** Let Wave 0 create the files (TASKFLOW-001 task)

---

### Step 2: Add TaskFlow Tasks to Roadmap

**Edit:** `state/roadmap.yaml`

**Add:** EPIC-TASKFLOW-VALIDATION with 10 subtasks

---

### Step 3: Run Wave 0 on TaskFlow

**Command:**
```bash
cd tools/wvo_mcp
npm run wave0
```

**Wave 0 will:**
1. Read roadmap.yaml
2. Find TASKFLOW-001 (pending, no dependencies)
3. Execute STRATEGIZE → MONITOR phases for TASKFLOW-001
4. Move to TASKFLOW-002
5. Continue until all tasks complete or blocked

---

### Step 4: Monitor Progress

**Check:**
- `state/analytics/wave0_runs.jsonl` - Execution logs
- `state/roadmap.yaml` - Task status updates
- `tools/taskflow/` - Files being created

**Screen recording:** Capture Wave 0 running (proof of live execution)

---

### Step 5: Test TaskFlow CLI

**Once Wave 0 completes:**

```bash
cd tools/taskflow
npm install
npm run build

# Test commands
npm start init
npm start add "Test task"
npm start list
npm start done 1
npm start stats
```

**Success:** ≥8 of 10 commands work

---

### Step 6: Capture Learnings

**Document:**
- Success rate (X/10 tasks)
- What worked well
- What broke (failure modes)
- What's missing for Wave 1
- Evidence (logs, screen recording, test results)

---

## RISKS AND MITIGATIONS

### Risk 1: Wave 0 Can't Handle Project Setup

**Scenario:** TASKFLOW-001 (create folders, files) might be too complex

**Likelihood:** Medium
**Impact:** High (blocks all subsequent tasks)

**Mitigation:**
- Manually create initial structure if needed
- Start Wave 0 at TASKFLOW-002 (types.ts)
- Document as "Wave 0 gap" for Wave 1

---

### Risk 2: TypeScript Compilation Errors

**Scenario:** Wave 0 generates code that doesn't compile

**Likelihood:** Medium
**Impact:** Medium (build fails, but can fix manually)

**Mitigation:**
- Wave 0 should run `npm run build` in VERIFY phase
- If build fails, task marked as failed (not completed)
- Document as failure mode for Wave 1 improvement

---

### Risk 3: Success Rate < 80%

**Scenario:** Wave 0 completes only 5-7 of 10 tasks

**Likelihood:** Medium
**Impact:** Low (still learning, just means Wave 1 needs work)

**Mitigation:**
- This is EXPECTED (Wave 0 is minimal)
- Document gaps discovered
- Use learnings to define Wave 1 scope
- Acceptance: 80% is target, not minimum

---

### Risk 4: TaskFlow CLI Doesn't Work

**Scenario:** Code compiles but commands crash/fail

**Likelihood:** Low (if Wave 0 follows verification loop)
**Impact:** Medium

**Mitigation:**
- Manual testing after each completed task
- Fix critical issues immediately
- Document as failure mode if Wave 0 didn't verify properly

---

## AFP/SCAS ALIGNMENT

### Via Negativa: What Can We DELETE?

**Examined:**
- Can we skip project setup? ❌ NO (need structure)
- Can we reduce 10 tasks? ❌ NO (already minimal)
- Can we use simpler tech stack? Maybe (plain JS vs TypeScript)
  - Decision: Keep TypeScript (familiar, proves complexity)

**Verdict:** Already minimal, no deletions possible

---

### Refactor Not Repair

**This is NEW implementation** (not fixing existing code)
- Creating from scratch
- Clean architecture from start
- No technical debt

**Assessment:** N/A (new project, not repair)

---

## METRICS

### Quantitative
- **Files to create:** 9
- **Total LOC:** ~315
- **Tasks for Wave 0:** 10
- **Target success rate:** ≥80% (8 of 10 tasks)
- **Estimated time:** 2-3 hours for Wave 0 to complete all tasks

### Qualitative
- **Complexity:** Moderate (real code generation, CLI, file I/O)
- **Usefulness:** High (functioning task tracker)
- **Safety:** High (separate from production WeatherVane)

---

## DEFINITION OF DONE (PLAN PHASE)

- [x] Project structure designed (9 files)
- [x] Each file's purpose and content outlined
- [x] LOC estimates provided (~315 total)
- [x] Wave 0 integration approach selected (add to roadmap.yaml)
- [x] Validation workflow defined (6 steps)
- [x] Risks identified with mitigations (4 risks)
- [x] Success criteria clear (≥80% completion, tool works)

**PLAN Phase Complete**
**Next Phase:** THINK (reason through edge cases and failure modes)
