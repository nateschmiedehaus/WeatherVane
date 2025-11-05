# MANDATORY PRE-WORK CHECKLIST

**STOP. Read this BEFORE making ANY code changes.**

Every agent must answer these questions BEFORE proceeding to implementation:

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

**Purpose**: This checklist enforces AFP/SCAS principles (micro-batching, via negativa, modularity, complexity control) at the planning stage, BEFORE damage is done to the codebase.
