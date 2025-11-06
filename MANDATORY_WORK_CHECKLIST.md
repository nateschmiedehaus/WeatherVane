# MANDATORY PRE-WORK CHECKLIST

**STOP. Read this BEFORE making ANY code changes.**

Every agent must complete these checks BEFORE proceeding to implementation.

---

## Phase 0: [GATE] Pre-Implementation Phase Verification

**AFP 10-Phase Lifecycle** requires completing phases 1-4 BEFORE implementing:

1. **STRATEGIZE** - Understand the problem
2. **SPEC** - Define requirements
3. **PLAN** - Design approach
4. **THINK** - Reason through solution
5. **[GATE]** ← YOU ARE HERE - Verify phases 1-4 complete
6. IMPLEMENT - Write code
7. VERIFY - Test it works
8. REVIEW - Quality check (includes phase compliance)
9. PR - Human review
10. MONITOR - Track results

**Phase completion requirements:**

- [ ] **STRATEGIZE complete**: I understand WHY this change is needed (not just WHAT)
  - Documented: Problem analysis, root cause, goal
  - Template: `docs/templates/strategy_template.md`
  - Test: `cd tools/wvo_mcp && npm run strategy:review [TASK-ID] && cd ../..`

- [ ] **SPEC complete**: I have defined success criteria and requirements
  - Documented: Acceptance criteria, functional + non-functional requirements

- [ ] **PLAN complete**: I have designed the approach
  - Documented: Architecture/flow, files to change, module structure, and the verification tests I authored during PLAN
  - Tests: Automated/manual tests now exist (failing/skipped is acceptable) or PLAN explicitly documents why tests are not applicable
  - Autopilot work: PLAN must list Wave 0 live testing steps (e.g., `npm run wave0`, `ps aux | grep wave0`, TaskFlow live smoke). No autopilot code may merge without these steps.
- [ ] **Daily artifact audit complete (≤24h)**: I ran the checklist in `docs/checklists/daily_artifact_health.md`, rotated overrides if needed, and committed `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md`.
- [ ] **Guardrail monitor passing**: `node tools/wvo_mcp/scripts/check_guardrails.mjs` reports success (or CI guardrail job is green) before marking the task done.

- [ ] **THINK complete**: I have reasoned through the solution
  - Documented: Edge cases, failure modes, AFP/SCAS validation
  - Template: `docs/templates/think_template.md`
  - Test: `cd tools/wvo_mcp && npm run think:review [TASK-ID] && cd ../..`

**Evidence requirement (NON-TRIVIAL changes >2 files or >50 LOC):**

- [ ] I have created `state/evidence/[TASK-ID]/phases.md` documenting phases 1-4
- [ ] OR this is a trivial change (≤2 files, ≤50 LOC) and I documented my reasoning inline

**Run quality critics before committing:**
- **StrategyReviewer**: `cd tools/wvo_mcp && npm run strategy:review [TASK-ID] && cd ../..`
  - Validates strategic thinking depth (strategy.md)
- **ThinkingCritic**: `cd tools/wvo_mcp && npm run think:review [TASK-ID] && cd ../..`
  - Validates depth of analysis (think.md)
- **DesignReviewer**: `cd tools/wvo_mcp && npm run gate:review [TASK-ID] && cd ../..`
  - Validates AFP/SCAS design thinking (design.md)

**Pre-commit hook will automatically run critics on staged files and BLOCK if concerns remain.**

**⚠️ IF GATE VIOLATED (you already coded without doing phases 1-4):**
- **STOP CODING IMMEDIATELY**
- **GO BACK** to phase 1 (STRATEGIZE) and work through phases 1-4 properly
- **RETHINK your implementation** through AFP/SCAS lens:
  - Can you DELETE instead of add? (via negativa)
  - Can you REFACTOR instead of patch?
  - How to reduce files/LOC?
- **Then revise your code** to match the better design
- This isn't bureaucracy - it's preventing codebase degradation

---

## Phase 0.5: Five Forces Alignment

**ALL design decisions must align with the five forces:**

### 1. COHERENCE - Match the terrain
- [ ] I searched for similar patterns (checked 3 most similar modules)
- [ ] I'm reusing proven pattern OR justifying why new pattern needed
- [ ] This matches the style/structure of surrounding code

### 2. ECONOMY - Achieve more with less
- [ ] I explored deletion/simplification (via negativa)
- [ ] If adding >50 LOC, I identified what to delete
- [ ] Changes are minimal (≤150 LOC, ≤5 files)

### 3. LOCALITY - Related near, unrelated far
- [ ] Related code is in same module
- [ ] Dependencies are local (not scattered)
- [ ] Changes don't create coupling across boundaries

### 4. VISIBILITY - Important obvious, unimportant hidden
- [ ] Errors are logged with context (no silent failures)
- [ ] Public interfaces are clear and minimal
- [ ] Complexity hidden behind abstraction

### 5. EVOLUTION - Patterns prove fitness
- [ ] I'm using proven pattern (tracked fitness) OR measuring new pattern
- [ ] Pattern will be logged in commit for fitness tracking
- [ ] Bad patterns can be deprecated based on data

**See:** [docs/AFP_QUICK_START.md](docs/AFP_QUICK_START.md) for 30-second heuristics and examples.

**Commit message must include:**
```
Pattern: [pattern_name]
Deleted: [what was removed/simplified, if +50 LOC added]
```

**Note:** Five forces GENERATE the specific checks below:
- ECONOMY → via negativa, micro-batching
- COHERENCE → refactor not repair (match root patterns)
- LOCALITY → modularity
- VISIBILITY → fail explicitly

---

## 1. Micro-Batching Check
- [ ] I will change ≤5 files (if more, SPLIT the task)
- [ ] I will add ≤150 net LOC (additions - deletions)
- [ ] This is a focused, atomic change

## 2. Via Negativa Check
- [ ] I have considered DELETING code instead of adding
- [ ] I have considered SIMPLIFYING existing code instead of patching
- [ ] If adding code: I cannot achieve this goal by deletion/simplification

## 3. Refactor vs Repair Check
**If you're "fixing" something:**
- [ ] The file I'm changing is <200 LOC (if >200, REFACTOR the whole file)
- [ ] The function I'm changing is <50 LOC (if >50, REFACTOR the whole function)
- [ ] This is NOT a patch/workaround (if it is, REFACTOR instead)

## 4. Complexity Check
- [ ] This change will NOT increase cyclomatic complexity
- [ ] This change will NOT increase nesting depth
- [ ] If complexity increases: I have STRONG justification (write below)

**Complexity justification (if needed):**
[Explain why complexity MUST increase and how you'll mitigate]

## 5. Alternatives Check
List at least 2 approaches you considered:

1. **Deletion/simplification approach:** [What could you delete/simplify?]
2. **Alternative implementation:** [Different way to achieve goal]
3. **Selected approach:** [What you chose and why]

## 6. Modularity Check
- [ ] This maintains or improves modularity (doesn't create tight coupling)
- [ ] This follows single responsibility principle
- [ ] I'm not creating "god functions/classes"

---

## Decision

**IF YOU CANNOT CHECK ALL BOXES:** Stop. Revise your plan. Do not proceed to implementation.

**IF ALL BOXES CHECKED:** Proceed, but re-check after implementation.

---

## Phase Compliance Review (Phase 8: REVIEW)

**After implementation, during REVIEW phase, verify phase compliance:**

- [ ] **GATE was followed**: I completed phases 1-4 before implementing
- [ ] **Evidence exists**: Phase documentation is in `state/evidence/[TASK-ID]/phases.md`
- [ ] **Implementation matches plan**: Code aligns with phase 3 (PLAN) design
- [ ] **PLAN captured verification tests**: Tests were authored before IMPLEMENT (or exemption documented) and VERIFY only executed them
- [ ] **Autopilot live loop executed**: If touching autopilot, Verify ran the Wave 0 live steps documented in PLAN (capture evidence or remediation task if blocked)
- [ ] **All quality checks pass**: Micro-batching, via negativa, complexity controls

**If phase compliance failed:**
- Create follow-up refactoring task to align with AFP/SCAS
- Document technical debt in `state/evidence/[TASK-ID]/debt.md`
- Do NOT mark task complete until compliance restored

---

## README Sync Workflow

**Distributed knowledge base**: Every directory should have README.md with human context (Purpose, Recent Changes) + automated analysis (docsync).

### Phase 1: STRATEGIZE (Task Start)

**Check local README:**

```bash
# Initialize README if missing
scripts/readme_init.sh .

# If README exists: Read it for context before starting work
cat README.md
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh .` to check/create README
- [ ] I read the existing README (if present) for context
- [ ] I edited the Purpose section (if new README) to describe intent

### Phase 7: VERIFY (Task End)

**Update README with recent changes:**

```bash
# Update Recent Changes section
scripts/readme_update.sh .

# Stage README with your changes
git add README.md
```

**Checklist:**
- [ ] I ran `scripts/readme_update.sh .` to document changes
- [ ] I wrote a meaningful change description (not "updated stuff")
- [ ] I selected appropriate impact level (low/medium/high)
- [ ] I staged README.md for commit

**Pre-commit hook will verify:**
- README exists in changed directories
- README updated within 24 hours
- README staged in commit

**If hook blocks commit:**
```bash
# Fix: Run readme_update.sh and stage README
scripts/readme_update.sh path/to/directory
git add path/to/directory/README.md
```

**See Also:**
- [README Sync Documentation](docs/workflows/README_SYNC.md)
- [README Template](docs/templates/readme_template.md)

## README Discoverability (Via Negativa Approach)

**Philosophy:** Don't force README reading—make good READMEs so valuable agents seek them naturally.

### Convention: Reference READMEs in strategy.md

**When starting STRATEGIZE phase, include README discovery:**

```markdown
## Hierarchical Context

**Check for existing READMEs (read if they exist):**
- Epic context: state/epics/[EPIC-ID]/README.md
- Milestone context: state/milestones/[MILESTONE-ID]/README.md
- Task group context: state/task_groups/[GROUP-ID]/README.md (optional)
- Module context: [working-directory]/README.md

**Purpose:** Discover strategic context before starting work.
```

**Example strategy.md snippet:**
```markdown
## Hierarchical Context

Checked READMEs:
- ✅ state/epics/WAVE-0/README.md - Autopilot foundation strategy
- ✅ state/milestones/W0.M1/README.md - Proof system milestone plan
- ✅ tools/wvo_mcp/src/critics/README.md - Critic architecture patterns
- ❌ state/task_groups/proof-system/README.md - Not found (acceptable)
```

**Checklist:**
- [ ] I checked for epic/milestone/task-group READMEs (if task has epic/milestone)
- [ ] I checked for module README in working directory
- [ ] I read READMEs that exist (skipped missing ones)
- [ ] I referenced READMEs in strategy.md (documents what context I used)

**Why this works (AFP/SCAS):**
- **Via Negativa:** No automation to maintain, no forced reading
- **Evolutionary:** Good READMEs get read → referenced → maintained; bad ones ignored → removed
- **Antifragile:** System learns which READMEs are valuable through agent behavior
- **Cultural:** Pattern spreads naturally (agents see references in evidence bundles)

**What NOT to do:**
- ❌ Don't force automatic README injection (wastes tokens)
- ❌ Don't add ceremony (pre-flight checks that slow work)
- ❌ Don't read ALL READMEs (only relevant ones)

**Fitness Signal:** Over time, only valuable READMEs survive. Unused READMEs are noise → agents ignore → README removed or improved.

## Hierarchical README Workflow (Epics/Milestones/Task Groups)

### When Creating New Epic

**Initialize epic README before starting epic work:**

```bash
# Create epic README directory
scripts/readme_init.sh state/epics/[EPIC-ID] [TASK-ID]

# Example:
scripts/readme_init.sh state/epics/WAVE-1 AFP-CREATE-WAVE-1
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh state/epics/[EPIC-ID] [TASK-ID]`
- [ ] I edited the **Purpose** section (WHY this epic exists, WHAT problem it solves)
- [ ] I listed **Success Criteria** (3-5 measurable outcomes)
- [ ] I documented **Architecture Decisions** (2-4 key technical choices)
- [ ] I listed **Risks** with mitigations
- [ ] I staged `state/epics/[EPIC-ID]/README.md` for commit

**Quality Check:**
- Purpose answers "WHY" not "HOW"
- Success criteria are measurable (not vague)
- Architecture decisions have rationale

### When Creating New Milestone

**Initialize milestone README before starting milestone work:**

```bash
# Create milestone README directory
scripts/readme_init.sh state/milestones/[MILESTONE-ID] [TASK-ID]

# Example:
scripts/readme_init.sh state/milestones/W1.M1 AFP-CREATE-W1-M1
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh state/milestones/[MILESTONE-ID] [TASK-ID]`
- [ ] I edited the **Purpose** section (WHAT capability is delivered)
- [ ] I documented **Phase Plan** (timeline, sequencing)
- [ ] I listed **Integration Requirements** (how milestone integrates)
- [ ] I listed **Acceptance Criteria** (3-5 measurable criteria)
- [ ] I staged `state/milestones/[MILESTONE-ID]/README.md` for commit

**Quality Check:**
- Purpose describes capability (not just "complete tasks")
- Phase plan has realistic timeline
- Acceptance criteria are testable

### When Creating Task Group (Optional)

**Initialize task group README for related tasks:**

```bash
# Create task group README directory
scripts/readme_init.sh state/task_groups/[GROUP-ID] [TASK-ID]

# Example:
scripts/readme_init.sh state/task_groups/proof-system AFP-PROOF-GROUP
```

**Checklist:**
- [ ] I ran `scripts/readme_init.sh state/task_groups/[GROUP-ID] [TASK-ID]`
- [ ] I edited the **Purpose** section (WHY tasks are grouped)
- [ ] I listed all **Tasks** in the group
- [ ] I documented **Shared Context** (common dependencies, integration points)
- [ ] I described **Execution Order** (if dependencies exist)
- [ ] I staged `state/task_groups/[GROUP-ID]/README.md` for commit

**Note:** Task groups are optional - only create when tasks share significant context

### Validation

**Pre-commit validation checks hierarchical READMEs:**

```bash
# Run validation manually
scripts/validate_roadmap_docs.sh

# If errors, follow fix instructions in output
```

**Validation checks:**
- All epics in roadmap.yaml have `state/epics/[EPIC-ID]/README.md`
- All milestones in roadmap.yaml have `state/milestones/[MILESTONE-ID]/README.md`
- All READMEs have valid YAML frontmatter
- All READMEs have required sections

---

**Purpose**: This checklist enforces AFP/SCAS principles (micro-batching, via negativa, modularity, complexity control, and phase discipline) at both planning (GATE) and review stages, preventing codebase degradation.
