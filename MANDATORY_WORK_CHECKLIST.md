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
  - Documented: Architecture/flow, files to change, module structure

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
- [ ] **All quality checks pass**: Micro-batching, via negativa, complexity controls

**If phase compliance failed:**
- Create follow-up refactoring task to align with AFP/SCAS
- Document technical debt in `state/evidence/[TASK-ID]/debt.md`
- Do NOT mark task complete until compliance restored

---

**Purpose**: This checklist enforces AFP/SCAS principles (micro-batching, via negativa, modularity, complexity control, and phase discipline) at both planning (GATE) and review stages, preventing codebase degradation.
