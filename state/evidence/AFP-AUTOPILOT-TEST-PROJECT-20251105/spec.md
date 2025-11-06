# SPEC Phase: TaskFlow CLI - Autopilot Test Project

**Task ID:** AFP-AUTOPILOT-TEST-PROJECT-20251105
**Date:** 2025-11-05
**Phase:** SPEC
**Depends On:** strategy.md (TaskFlow CLI selected, 9/9 AFP/SCAS)

---

## CRITICAL: Definition of "Functioning"

⚠️ **"Functioning" ≠ Build Passing**

**"Functioning" means:**
1. **Live agent summoned** (Wave 0 autopilot running)
2. **Agent autonomously completes** all TaskFlow tasks
3. **Agent writes working code** (not just files that compile)
4. **TaskFlow CLI executable and usable** (commands actually work)
5. **Success rate ≥80%** (8 of 10 features functional)

**NOT sufficient:** Build passes, tests pass, npm audit clean

**Required:** Autopilot completes project → tool works when executed

---

## PROJECT REQUIREMENTS

### TaskFlow CLI Tool

**Description:** Minimal task tracker as command-line interface

**Purpose:** Prove autopilot can autonomously build a functioning application from scratch

**Language:** TypeScript (Node.js CLI)

**Scope:** 10 commands (features) spanning trivial → moderate complexity

---

## FUNCTIONAL REQUIREMENTS

### FR1: Initialize Task List
**Command:** `taskflow init`
**Behavior:**
- Creates `.taskflow.json` in current directory
- Initial structure: `{ "tasks": [], "nextId": 1 }`
- Error if file already exists
- Success message: "Initialized TaskFlow in [directory]"

**Complexity:** Trivial (file I/O, JSON)

### FR2: Add Task
**Command:** `taskflow add "task description"`
**Behavior:**
- Appends task to `.taskflow.json`
- Auto-assigns ID (incrementing)
- Task structure: `{ id, description, status: "pending", createdAt }`
- Success message: "Added task #[id]: [description]"

**Complexity:** Easy (JSON manipulation)

### FR3: List All Tasks
**Command:** `taskflow list`
**Behavior:**
- Reads `.taskflow.json`
- Displays all tasks formatted:
  ```
  #1 [ ] Buy groceries (created: 2025-11-05)
  #2 [✓] Fix bug (created: 2025-11-04)
  ```
- Empty list message: "No tasks found. Use 'taskflow add' to create one."

**Complexity:** Easy (read + format)

### FR4: Mark Task Complete
**Command:** `taskflow done [id]`
**Behavior:**
- Updates task status to "done"
- Error if ID not found
- Success message: "Marked task #[id] as done"

**Complexity:** Easy (JSON update)

### FR5: Remove Task
**Command:** `taskflow remove [id]`
**Behavior:**
- Deletes task from list
- Error if ID not found
- Success message: "Removed task #[id]"

**Complexity:** Easy (array filter)

### FR6: Filter by Status
**Command:** `taskflow list --status [pending|done]`
**Behavior:**
- Shows only tasks matching status
- Same format as FR3

**Complexity:** Moderate (CLI args parsing + filter)

### FR7: Simple Statistics
**Command:** `taskflow stats`
**Behavior:**
- Displays:
  ```
  Total tasks: 10
  Pending: 7
  Done: 3
  Completion rate: 30%
  ```

**Complexity:** Moderate (aggregation)

### FR8: Color-Coded Output
**Enhancement to FR3:**
- Pending tasks: yellow
- Done tasks: green
- Use chalk or similar library

**Complexity:** Moderate (library integration)

### FR9: Help Command
**Command:** `taskflow --help` or `taskflow help`
**Behavior:**
- Lists all commands with usage
- Clear, formatted output

**Complexity:** Easy (static text)

### FR10: Persist Across Sessions
**Implicit requirement:**
- All commands read/write `.taskflow.json`
- State persists between executions
- No in-memory-only data

**Complexity:** Easy (already part of FR1-FR7)

---

## NON-FUNCTIONAL REQUIREMENTS

### NFR1: Executable CLI
- Shebang or npm script to run
- Example: `npm start add "test"` or `./taskflow.sh add "test"`
- Works from command line without Node.js knowledge

### NFR2: Error Handling
- Graceful failures (no crashes)
- Clear error messages
- Example: "Error: .taskflow.json not found. Run 'taskflow init' first."

### NFR3: No External Services
- No databases, APIs, or network calls
- Pure local file system
- Reason: Simplicity, no external dependencies to fail

### NFR4: TypeScript + Node.js
- Use familiar stack (WeatherVane is TypeScript)
- Standard project structure (src/, package.json, tsconfig.json)

### NFR5: Simple Dependencies
- Only essential packages (chalk for colors, maybe commander for CLI parsing)
- No heavy frameworks

---

## SUCCESS CRITERIA

### Phase-Level Criteria

**Project Setup:**
- [ ] `tools/taskflow/` folder created
- [ ] `package.json` with correct scripts
- [ ] `tsconfig.json` configured
- [ ] `README.md` with usage instructions
- [ ] Initial file structure (src/, .gitignore, etc.)

**Autopilot Validation (LIVE-FIRE):**
- [ ] Wave 0 autonomously completes 8+ of 10 TaskFlow tasks
- [ ] Tasks added to `state/roadmap.yaml` under epic "TASKFLOW-VALIDATION"
- [ ] Wave 0 runner pointed at TaskFlow tasks
- [ ] Autopilot runs LIVE (not simulated)
- [ ] Evidence captured (logs, analytics, screen recording)

**Functioning Tool:**
- [ ] TaskFlow CLI can be executed
- [ ] `taskflow init` creates .taskflow.json ✅
- [ ] `taskflow add "test"` adds task ✅
- [ ] `taskflow list` shows tasks ✅
- [ ] `taskflow done 1` marks task complete ✅
- [ ] `taskflow remove 1` removes task ✅
- [ ] At least 8 of 10 commands work ✅
- [ ] No crashes during normal usage ✅

**Documentation:**
- [ ] README explains how to use TaskFlow
- [ ] Evidence bundle documents autopilot performance
- [ ] Learnings captured (what worked/broke in Wave 0)

---

## ACCEPTANCE CRITERIA

### User Story
**As a developer,**
**I want** to see autopilot autonomously build a functioning CLI tool,
**So that** I have confidence autopilot works before deploying to production WeatherVane.

### Acceptance Tests

**Test 1: Autopilot Completes Project**
- **Given:** TaskFlow tasks in roadmap.yaml (10 tasks)
- **When:** Wave 0 runs live
- **Then:**
  - Autopilot selects and completes ≥8 tasks
  - Creates working code for each feature
  - Updates task status in roadmap

**Test 2: TaskFlow Tool Works**
- **Given:** Autopilot has completed TaskFlow tasks
- **When:** User runs `taskflow init`, `taskflow add "test"`, `taskflow list`
- **Then:**
  - Commands execute without errors
  - .taskflow.json is created and updated
  - Output is correct and formatted

**Test 3: Success Rate ≥80%**
- **Given:** 10 TaskFlow tasks attempted
- **When:** Count completed vs. failed
- **Then:** ≥8 tasks completed successfully (80%+)

**Test 4: Evidence Captured**
- **Given:** Autopilot validation complete
- **When:** Review evidence bundle
- **Then:**
  - Execution logs present (state/analytics/wave0_runs.jsonl)
  - Success/failure breakdown documented
  - Learnings captured (what to improve in Wave 1)

---

## SCOPE

### In Scope
- **This Task (Project Definition):**
  - Define TaskFlow requirements (this document)
  - Plan project structure
  - Define validation approach

- **Future Tasks (Setup + Validation):**
  - Create TaskFlow project structure
  - Write initial README with task list
  - Add TaskFlow tasks to roadmap.yaml
  - Run Wave 0 on TaskFlow
  - Capture results and learnings

### Out of Scope
- Advanced features (priorities, due dates, tags)
- Web UI or GUI
- Cloud sync or multi-device
- User authentication
- Testing on multiple projects (just TaskFlow for now)
- Wave 1 implementation (happens after TaskFlow validation)

---

## DEPENDENCIES

### Upstream (Must Exist Before)
- ✅ Wave 0 autopilot running (exists, currently on WeatherVane)
- ✅ Roadmap structure (state/roadmap.yaml)
- ✅ Evidence bundle process

### Downstream (Will Be Impacted)
- Wave 0 validation (TaskFlow proves it works)
- Wave 1 scope (defined by TaskFlow learnings)
- Production WeatherVane deployment (only after TaskFlow success)

---

## CONSTRAINTS

### Hard Constraints
- MUST be real work (not mocks)
- MUST use live autopilot (not simulated)
- MUST prove code generation (not just task tracking)
- MUST achieve ≥80% success rate
- MUST be completable quickly (days not weeks)

### Soft Constraints
- SHOULD use TypeScript (familiar stack)
- SHOULD be simple (CLI, no complex UI)
- SHOULD be useful (we or others can use it)
- SHOULD document learnings (for Wave 1)

---

## DEFINITION OF DONE

**This Task (SPEC Phase):**
- [x] TaskFlow requirements defined (10 features)
- [x] Success criteria clear (80% completion, tool works)
- [x] "Functioning" defined (live-fire, not build passing)
- [x] Acceptance tests specified

**Future Tasks (Setup + Validation):**
- [ ] TaskFlow project created
- [ ] Tasks added to roadmap
- [ ] Wave 0 runs on TaskFlow
- [ ] ≥80% success rate achieved
- [ ] Tool is executable and works
- [ ] Learnings documented

---

**SPEC Phase Complete**
**Next Phase:** PLAN (design TaskFlow structure and Wave 0 integration)
